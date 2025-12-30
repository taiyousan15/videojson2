"""
InsightFace Face Swap Server

Face detection, embedding, and swapping using InsightFace + inswapper
Optional face restoration using GFPGAN

Usage:
    pip install insightface onnxruntime opencv-python flask gfpgan
    python server.py

Endpoints:
    GET  /health - Health check
    POST /detect - Detect faces in image
    POST /embed  - Generate face embeddings
    POST /swap   - Swap faces in image (with optional restoration)
"""

import os
import sys

# Fix for basicsr/gfpgan compatibility with newer torchvision
# Create shim for deprecated torchvision.transforms.functional_tensor
try:
    import torchvision
    import torchvision.transforms.functional as F
    import types

    # Check if functional_tensor already exists in sys.modules
    if 'torchvision.transforms.functional_tensor' not in sys.modules:
        # Create a module shim that redirects to functional
        functional_tensor = types.ModuleType('torchvision.transforms.functional_tensor')
        functional_tensor.rgb_to_grayscale = F.rgb_to_grayscale
        sys.modules['torchvision.transforms.functional_tensor'] = functional_tensor
        print("Applied torchvision.transforms.functional_tensor compatibility shim")
except ImportError:
    pass

import cv2
import numpy as np
from flask import Flask, request, jsonify
import insightface
from insightface.app import FaceAnalysis

app = Flask(__name__)

# Global face analyzer, swapper, and restorer
face_analyzer = None
face_swapper = None
face_restorer = None


def get_face_analyzer():
    global face_analyzer
    if face_analyzer is None:
        face_analyzer = FaceAnalysis(name='buffalo_l', providers=['CPUExecutionProvider'])
        face_analyzer.prepare(ctx_id=0, det_size=(640, 640))
    return face_analyzer


def get_face_swapper():
    global face_swapper
    if face_swapper is None:
        model_path = os.path.expanduser('~/.insightface/models/inswapper_128.onnx')
        if not os.path.exists(model_path):
            raise FileNotFoundError(
                f"Face swapper model not found at {model_path}. "
                "Download from: https://github.com/facefusion/facefusion-assets/releases"
            )
        face_swapper = insightface.model_zoo.get_model(model_path, providers=['CPUExecutionProvider'])
    return face_swapper


def get_face_restorer():
    """Initialize GFPGAN face restorer"""
    global face_restorer
    if face_restorer is None:
        try:
            from gfpgan import GFPGANer
            model_path = os.path.expanduser('~/.gfpgan/weights/GFPGANv1.4.pth')
            if not os.path.exists(model_path):
                print(f"GFPGAN model not found at {model_path}")
                return None
            face_restorer = GFPGANer(
                model_path=model_path,
                upscale=1,
                arch='clean',
                channel_multiplier=2,
                bg_upsampler=None
            )
            print("GFPGAN loaded successfully")
        except Exception as e:
            print(f"Failed to load GFPGAN: {e}")
            return None
    return face_restorer


def restore_face(img):
    """Apply GFPGAN face restoration to an image"""
    restorer = get_face_restorer()
    if restorer is None:
        return img

    try:
        # GFPGAN expects BGR image
        _, _, restored_img = restorer.enhance(
            img,
            has_aligned=False,
            only_center_face=False,
            paste_back=True
        )
        return restored_img
    except Exception as e:
        print(f"Face restoration failed: {e}")
        return img


@app.route('/health', methods=['GET'])
def health():
    restorer_status = "loaded" if face_restorer is not None else "not loaded"
    return jsonify({
        'status': 'ok',
        'service': 'insightface',
        'gfpgan': restorer_status
    })


@app.route('/detect', methods=['POST'])
def detect():
    """Detect faces in an image"""
    data = request.json
    image_path = data.get('image_path')

    if not image_path or not os.path.exists(image_path):
        return jsonify({'error': 'Image not found'}), 400

    try:
        img = cv2.imread(image_path)
        if img is None:
            return jsonify({'error': 'Failed to read image'}), 400

        analyzer = get_face_analyzer()
        faces = analyzer.get(img)

        result = []
        for i, face in enumerate(faces):
            bbox = face.bbox.astype(int).tolist()
            result.append({
                'id': f'face_{i}',
                'bbox': {
                    'x': bbox[0],
                    'y': bbox[1],
                    'width': bbox[2] - bbox[0],
                    'height': bbox[3] - bbox[1],
                },
                'landmarks': face.landmark_2d_106.tolist() if face.landmark_2d_106 is not None else None,
                'confidence': float(face.det_score),
            })

        return jsonify({'faces': result})

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/embed', methods=['POST'])
def embed():
    """Generate face embedding"""
    data = request.json
    image_path = data.get('image_path')

    if not image_path or not os.path.exists(image_path):
        return jsonify({'error': 'Image not found'}), 400

    try:
        img = cv2.imread(image_path)
        if img is None:
            return jsonify({'error': 'Failed to read image'}), 400

        analyzer = get_face_analyzer()
        faces = analyzer.get(img)

        if len(faces) == 0:
            return jsonify({'error': 'No face detected'}), 400

        # Use the largest face
        face = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))

        return jsonify({
            'embedding': face.embedding.tolist(),
            'quality': float(face.det_score),
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/swap', methods=['POST'])
def swap():
    """Swap face in source image with target face

    Optional: Set 'restore_face': true to apply GFPGAN face restoration
    """
    data = request.json
    source_image = data.get('source_image')
    target_face = data.get('target_face')
    output_path = data.get('output_path')
    do_restore = data.get('restore_face', False)

    if not source_image or not os.path.exists(source_image):
        return jsonify({'error': 'Source image not found'}), 400

    if not target_face or not os.path.exists(target_face):
        return jsonify({'error': 'Target face image not found'}), 400

    if not output_path:
        return jsonify({'error': 'Output path not specified'}), 400

    try:
        # Read images
        source_img = cv2.imread(source_image)
        target_img = cv2.imread(target_face)

        if source_img is None:
            return jsonify({'error': 'Failed to read source image'}), 400
        if target_img is None:
            return jsonify({'error': 'Failed to read target face image'}), 400

        analyzer = get_face_analyzer()
        swapper = get_face_swapper()

        # Detect faces in both images
        source_faces = analyzer.get(source_img)
        target_faces = analyzer.get(target_img)

        if len(target_faces) == 0:
            return jsonify({'error': 'No face detected in target image'}), 400

        # Use the largest face from target as the swap source
        target_face_obj = max(target_faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))

        # Swap all faces in source with target face
        result_img = source_img.copy()
        faces_swapped = 0

        for face in source_faces:
            result_img = swapper.get(result_img, face, target_face_obj, paste_back=True)
            faces_swapped += 1

        # Apply face restoration if requested
        restored = False
        if do_restore and faces_swapped > 0:
            result_img = restore_face(result_img)
            restored = True

        # Ensure output directory exists
        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        # Save result
        cv2.imwrite(output_path, result_img)

        return jsonify({
            'success': True,
            'output_path': output_path,
            'faces_swapped': faces_swapped,
            'restored': restored,
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/swap_video', methods=['POST'])
def swap_video():
    """Swap faces in a video (alternative to frame-by-frame processing)"""
    data = request.json
    source_video = data.get('source_video')
    target_face = data.get('target_face')
    output_path = data.get('output_path')

    if not source_video or not os.path.exists(source_video):
        return jsonify({'error': 'Source video not found'}), 400

    if not target_face or not os.path.exists(target_face):
        return jsonify({'error': 'Target face image not found'}), 400

    if not output_path:
        return jsonify({'error': 'Output path not specified'}), 400

    try:
        analyzer = get_face_analyzer()
        swapper = get_face_swapper()

        # Read target face
        target_img = cv2.imread(target_face)
        target_faces = analyzer.get(target_img)

        if len(target_faces) == 0:
            return jsonify({'error': 'No face detected in target image'}), 400

        target_face_obj = max(target_faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))

        # Process video
        cap = cv2.VideoCapture(source_video)
        fps = cap.get(cv2.CAP_PROP_FPS)
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        # Ensure output directory exists
        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

        frame_count = 0
        faces_swapped = 0

        while True:
            ret, frame = cap.read()
            if not ret:
                break

            # Detect and swap faces
            faces = analyzer.get(frame)

            for face in faces:
                frame = swapper.get(frame, face, target_face_obj, paste_back=True)
                faces_swapped += 1

            out.write(frame)
            frame_count += 1

            if frame_count % 30 == 0:
                print(f"Processed {frame_count}/{total_frames} frames")

        cap.release()
        out.release()

        return jsonify({
            'success': True,
            'output_path': output_path,
            'frames_processed': frame_count,
            'faces_swapped': faces_swapped,
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8001))
    print(f"Starting InsightFace server on port {port}")
    print("Endpoints:")
    print("  GET  /health - Health check")
    print("  POST /detect - Detect faces")
    print("  POST /embed  - Generate embeddings")
    print("  POST /swap   - Swap faces (with optional GFPGAN restoration)")
    print("  POST /swap_video - Swap faces in video")

    # Pre-load models
    print("Loading models...")
    try:
        get_face_analyzer()
        print("Face analyzer loaded")
        get_face_swapper()
        print("Face swapper loaded")
        get_face_restorer()
        print("Face restorer (GFPGAN) loaded")
    except Exception as e:
        print(f"Warning: Could not pre-load models: {e}")

    app.run(host='0.0.0.0', port=port, debug=False)
