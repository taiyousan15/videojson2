# InsightFace Face Swap Server

Face detection, embedding, and swapping service using InsightFace.

## Setup

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Download Face Swap Model

Download `inswapper_128.onnx` from:
https://github.com/facefusion/facefusion-assets/releases

Place it in: `~/.insightface/models/inswapper_128.onnx`

```bash
mkdir -p ~/.insightface/models
# Download and place inswapper_128.onnx in the directory
```

### 3. Run Server

```bash
python server.py
```

Server will start on port 8001 by default.

## API Endpoints

### Health Check
```bash
curl http://localhost:8001/health
```

### Detect Faces
```bash
curl -X POST http://localhost:8001/detect \
  -H "Content-Type: application/json" \
  -d '{"image_path": "/path/to/image.jpg"}'
```

### Generate Embedding
```bash
curl -X POST http://localhost:8001/embed \
  -H "Content-Type: application/json" \
  -d '{"image_path": "/path/to/image.jpg"}'
```

### Swap Face
```bash
curl -X POST http://localhost:8001/swap \
  -H "Content-Type: application/json" \
  -d '{
    "source_image": "/path/to/source.jpg",
    "target_face": "/path/to/target_face.jpg",
    "output_path": "/path/to/output.jpg"
  }'
```

### Swap Faces in Video
```bash
curl -X POST http://localhost:8001/swap_video \
  -H "Content-Type: application/json" \
  -d '{
    "source_video": "/path/to/source.mp4",
    "target_face": "/path/to/target_face.jpg",
    "output_path": "/path/to/output.mp4"
  }'
```

## Environment Variables

- `PORT`: Server port (default: 8001)

## GPU Acceleration

To use GPU, install ONNX Runtime with CUDA support:

```bash
pip uninstall onnxruntime
pip install onnxruntime-gpu
```

Then modify `server.py` to use `CUDAExecutionProvider`:

```python
face_analyzer = FaceAnalysis(name='buffalo_l', providers=['CUDAExecutionProvider'])
```
