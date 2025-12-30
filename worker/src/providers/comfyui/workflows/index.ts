/**
 * ComfyUI Workflow Templates
 *
 * 動画生成に使用するワークフローテンプレート集
 */

import { ComfyWorkflow } from "../client";

export interface WorkflowTemplate {
  name: string;
  description: string;
  category: "image" | "video" | "upscale" | "inpaint";
  workflow: ComfyWorkflow;
  inputs: WorkflowInput[];
  outputs: WorkflowOutput[];
}

export interface WorkflowInput {
  name: string;
  type: "string" | "number" | "image" | "video" | "boolean";
  nodeId: string;
  inputKey: string;
  required: boolean;
  default?: any;
  description?: string;
}

export interface WorkflowOutput {
  name: string;
  type: "image" | "video" | "latent";
  nodeId: string;
}

/**
 * SDXL Text-to-Image Workflow
 */
export const SDXL_TEXT_TO_IMAGE: WorkflowTemplate = {
  name: "SDXL Text to Image",
  description: "Generate high-quality images using SDXL model",
  category: "image",
  inputs: [
    { name: "prompt", type: "string", nodeId: "6", inputKey: "text", required: true, description: "Positive prompt" },
    { name: "negativePrompt", type: "string", nodeId: "7", inputKey: "text", required: false, default: "", description: "Negative prompt" },
    { name: "width", type: "number", nodeId: "5", inputKey: "width", required: false, default: 1024 },
    { name: "height", type: "number", nodeId: "5", inputKey: "height", required: false, default: 1024 },
    { name: "seed", type: "number", nodeId: "3", inputKey: "seed", required: false },
    { name: "steps", type: "number", nodeId: "3", inputKey: "steps", required: false, default: 25 },
    { name: "cfg", type: "number", nodeId: "3", inputKey: "cfg", required: false, default: 7 },
  ],
  outputs: [{ name: "image", type: "image", nodeId: "9" }],
  workflow: {
    "3": {
      class_type: "KSampler",
      inputs: {
        seed: 0,
        steps: 25,
        cfg: 7,
        sampler_name: "euler",
        scheduler: "normal",
        denoise: 1,
        model: ["4", 0],
        positive: ["6", 0],
        negative: ["7", 0],
        latent_image: ["5", 0],
      },
    },
    "4": {
      class_type: "CheckpointLoaderSimple",
      inputs: {
        ckpt_name: "sd_xl_base_1.0.safetensors",
      },
    },
    "5": {
      class_type: "EmptyLatentImage",
      inputs: {
        width: 1024,
        height: 1024,
        batch_size: 1,
      },
    },
    "6": {
      class_type: "CLIPTextEncode",
      inputs: {
        text: "",
        clip: ["4", 1],
      },
    },
    "7": {
      class_type: "CLIPTextEncode",
      inputs: {
        text: "",
        clip: ["4", 1],
      },
    },
    "8": {
      class_type: "VAEDecode",
      inputs: {
        samples: ["3", 0],
        vae: ["4", 2],
      },
    },
    "9": {
      class_type: "SaveImage",
      inputs: {
        filename_prefix: "SDXL",
        images: ["8", 0],
      },
    },
  },
};

/**
 * Image Upscale Workflow (4x)
 */
export const IMAGE_UPSCALE_4X: WorkflowTemplate = {
  name: "Image Upscale 4x",
  description: "Upscale image 4x using Real-ESRGAN",
  category: "upscale",
  inputs: [
    { name: "image", type: "image", nodeId: "1", inputKey: "image", required: true },
  ],
  outputs: [{ name: "image", type: "image", nodeId: "3" }],
  workflow: {
    "1": {
      class_type: "LoadImage",
      inputs: {
        image: "",
      },
    },
    "2": {
      class_type: "UpscaleModelLoader",
      inputs: {
        model_name: "RealESRGAN_x4plus.pth",
      },
    },
    "3": {
      class_type: "ImageUpscaleWithModel",
      inputs: {
        upscale_model: ["2", 0],
        image: ["1", 0],
      },
    },
    "4": {
      class_type: "SaveImage",
      inputs: {
        filename_prefix: "Upscaled",
        images: ["3", 0],
      },
    },
  },
};

/**
 * Image Inpainting Workflow
 */
export const IMAGE_INPAINT: WorkflowTemplate = {
  name: "Image Inpaint",
  description: "Inpaint masked region of image",
  category: "inpaint",
  inputs: [
    { name: "image", type: "image", nodeId: "1", inputKey: "image", required: true },
    { name: "mask", type: "image", nodeId: "2", inputKey: "image", required: true },
    { name: "prompt", type: "string", nodeId: "6", inputKey: "text", required: true },
    { name: "negativePrompt", type: "string", nodeId: "7", inputKey: "text", required: false, default: "" },
    { name: "denoise", type: "number", nodeId: "3", inputKey: "denoise", required: false, default: 1 },
  ],
  outputs: [{ name: "image", type: "image", nodeId: "9" }],
  workflow: {
    "1": {
      class_type: "LoadImage",
      inputs: {
        image: "",
      },
    },
    "2": {
      class_type: "LoadImage",
      inputs: {
        image: "",
      },
    },
    "3": {
      class_type: "KSampler",
      inputs: {
        seed: 0,
        steps: 20,
        cfg: 7,
        sampler_name: "euler",
        scheduler: "normal",
        denoise: 1,
        model: ["4", 0],
        positive: ["6", 0],
        negative: ["7", 0],
        latent_image: ["10", 0],
      },
    },
    "4": {
      class_type: "CheckpointLoaderSimple",
      inputs: {
        ckpt_name: "v1-5-pruned-emaonly.ckpt",
      },
    },
    "6": {
      class_type: "CLIPTextEncode",
      inputs: {
        text: "",
        clip: ["4", 1],
      },
    },
    "7": {
      class_type: "CLIPTextEncode",
      inputs: {
        text: "",
        clip: ["4", 1],
      },
    },
    "8": {
      class_type: "VAEDecode",
      inputs: {
        samples: ["3", 0],
        vae: ["4", 2],
      },
    },
    "9": {
      class_type: "SaveImage",
      inputs: {
        filename_prefix: "Inpaint",
        images: ["8", 0],
      },
    },
    "10": {
      class_type: "SetLatentNoiseMask",
      inputs: {
        samples: ["11", 0],
        mask: ["12", 0],
      },
    },
    "11": {
      class_type: "VAEEncode",
      inputs: {
        pixels: ["1", 0],
        vae: ["4", 2],
      },
    },
    "12": {
      class_type: "ImageToMask",
      inputs: {
        image: ["2", 0],
        channel: "red",
      },
    },
  },
};

/**
 * AnimateDiff Video Generation
 */
export const ANIMATEDIFF_VIDEO: WorkflowTemplate = {
  name: "AnimateDiff Video",
  description: "Generate short video clips using AnimateDiff",
  category: "video",
  inputs: [
    { name: "prompt", type: "string", nodeId: "6", inputKey: "text", required: true },
    { name: "negativePrompt", type: "string", nodeId: "7", inputKey: "text", required: false, default: "low quality, blurry" },
    { name: "frames", type: "number", nodeId: "5", inputKey: "batch_size", required: false, default: 16 },
    { name: "fps", type: "number", nodeId: "video_output", inputKey: "frame_rate", required: false, default: 8 },
    { name: "motionScale", type: "number", nodeId: "3", inputKey: "motion_scale", required: false, default: 1.0 },
    { name: "seed", type: "number", nodeId: "8", inputKey: "seed", required: false },
  ],
  outputs: [{ name: "video", type: "video", nodeId: "video_output" }],
  workflow: {
    "2": {
      class_type: "CheckpointLoaderSimple",
      inputs: {
        ckpt_name: "v1-5-pruned-emaonly.ckpt",
      },
    },
    "3": {
      class_type: "ADE_AnimateDiffLoaderWithContext",
      inputs: {
        model_name: "mm_sd_v15_v2.ckpt",
        beta_schedule: "sqrt_linear (AnimateDiff)",
        motion_scale: 1.0,
        apply_v2_models_properly: true,
        model: ["2", 0],
        context_options: ["4", 0],
      },
    },
    "4": {
      class_type: "ADE_StandardUniformContextOptions",
      inputs: {
        context_length: 16,
        context_stride: 1,
        context_overlap: 4,
        closed_loop: false,
        fuse_method: "flat",
        use_on_equal_length: false,
      },
    },
    "5": {
      class_type: "EmptyLatentImage",
      inputs: {
        width: 512,
        height: 512,
        batch_size: 16,
      },
    },
    "6": {
      class_type: "CLIPTextEncode",
      inputs: {
        text: "",
        clip: ["2", 1],
      },
    },
    "7": {
      class_type: "CLIPTextEncode",
      inputs: {
        text: "low quality, blurry, distorted",
        clip: ["2", 1],
      },
    },
    "8": {
      class_type: "KSampler",
      inputs: {
        seed: 0,
        steps: 20,
        cfg: 7,
        sampler_name: "euler",
        scheduler: "normal",
        denoise: 1,
        model: ["3", 0],
        positive: ["6", 0],
        negative: ["7", 0],
        latent_image: ["5", 0],
      },
    },
    "9": {
      class_type: "VAEDecode",
      inputs: {
        samples: ["8", 0],
        vae: ["2", 2],
      },
    },
    video_output: {
      class_type: "VHS_VideoCombine",
      inputs: {
        frame_rate: 8,
        loop_count: 0,
        filename_prefix: "AnimateDiff",
        format: "video/h264-mp4",
        pingpong: false,
        save_output: true,
        images: ["9", 0],
      },
    },
  },
};

/**
 * Image-to-Video with AnimateDiff
 */
export const IMAGE_TO_VIDEO: WorkflowTemplate = {
  name: "Image to Video",
  description: "Animate a static image using AnimateDiff",
  category: "video",
  inputs: [
    { name: "image", type: "image", nodeId: "1", inputKey: "image", required: true },
    { name: "prompt", type: "string", nodeId: "6", inputKey: "text", required: false, default: "high quality, smooth motion" },
    { name: "fps", type: "number", nodeId: "video_output", inputKey: "frame_rate", required: false, default: 8 },
    { name: "motionScale", type: "number", nodeId: "3", inputKey: "motion_scale", required: false, default: 1.0 },
    { name: "denoise", type: "number", nodeId: "8", inputKey: "denoise", required: false, default: 0.8 },
  ],
  outputs: [{ name: "video", type: "video", nodeId: "video_output" }],
  workflow: {
    "1": {
      class_type: "LoadImage",
      inputs: {
        image: "",
      },
    },
    "2": {
      class_type: "CheckpointLoaderSimple",
      inputs: {
        ckpt_name: "v1-5-pruned-emaonly.ckpt",
      },
    },
    "3": {
      class_type: "ADE_AnimateDiffLoaderWithContext",
      inputs: {
        model_name: "mm_sd_v15_v2.ckpt",
        beta_schedule: "sqrt_linear (AnimateDiff)",
        motion_scale: 1.0,
        apply_v2_models_properly: true,
        model: ["2", 0],
        context_options: ["4", 0],
      },
    },
    "4": {
      class_type: "ADE_StandardUniformContextOptions",
      inputs: {
        context_length: 16,
        context_stride: 1,
        context_overlap: 4,
        closed_loop: false,
        fuse_method: "flat",
        use_on_equal_length: false,
      },
    },
    "5": {
      class_type: "VAEEncode",
      inputs: {
        pixels: ["1", 0],
        vae: ["2", 2],
      },
    },
    "6": {
      class_type: "CLIPTextEncode",
      inputs: {
        text: "high quality, smooth motion",
        clip: ["2", 1],
      },
    },
    "7": {
      class_type: "CLIPTextEncode",
      inputs: {
        text: "low quality, blurry, distorted",
        clip: ["2", 1],
      },
    },
    "8": {
      class_type: "KSampler",
      inputs: {
        seed: 0,
        steps: 20,
        cfg: 7,
        sampler_name: "euler",
        scheduler: "normal",
        denoise: 0.8,
        model: ["3", 0],
        positive: ["6", 0],
        negative: ["7", 0],
        latent_image: ["5", 0],
      },
    },
    "9": {
      class_type: "VAEDecode",
      inputs: {
        samples: ["8", 0],
        vae: ["2", 2],
      },
    },
    video_output: {
      class_type: "VHS_VideoCombine",
      inputs: {
        frame_rate: 8,
        loop_count: 0,
        filename_prefix: "I2V",
        format: "video/h264-mp4",
        pingpong: false,
        save_output: true,
        images: ["9", 0],
      },
    },
  },
};

/**
 * ControlNet Pose-to-Image
 */
export const CONTROLNET_POSE: WorkflowTemplate = {
  name: "ControlNet Pose",
  description: "Generate image from pose skeleton using ControlNet",
  category: "image",
  inputs: [
    { name: "poseImage", type: "image", nodeId: "1", inputKey: "image", required: true },
    { name: "prompt", type: "string", nodeId: "6", inputKey: "text", required: true },
    { name: "negativePrompt", type: "string", nodeId: "7", inputKey: "text", required: false, default: "" },
    { name: "controlStrength", type: "number", nodeId: "10", inputKey: "strength", required: false, default: 1.0 },
  ],
  outputs: [{ name: "image", type: "image", nodeId: "9" }],
  workflow: {
    "1": {
      class_type: "LoadImage",
      inputs: {
        image: "",
      },
    },
    "2": {
      class_type: "CheckpointLoaderSimple",
      inputs: {
        ckpt_name: "v1-5-pruned-emaonly.ckpt",
      },
    },
    "3": {
      class_type: "KSampler",
      inputs: {
        seed: 0,
        steps: 20,
        cfg: 7,
        sampler_name: "euler",
        scheduler: "normal",
        denoise: 1,
        model: ["10", 0],
        positive: ["10", 1],
        negative: ["10", 2],
        latent_image: ["5", 0],
      },
    },
    "5": {
      class_type: "EmptyLatentImage",
      inputs: {
        width: 512,
        height: 512,
        batch_size: 1,
      },
    },
    "6": {
      class_type: "CLIPTextEncode",
      inputs: {
        text: "",
        clip: ["2", 1],
      },
    },
    "7": {
      class_type: "CLIPTextEncode",
      inputs: {
        text: "",
        clip: ["2", 1],
      },
    },
    "8": {
      class_type: "VAEDecode",
      inputs: {
        samples: ["3", 0],
        vae: ["2", 2],
      },
    },
    "9": {
      class_type: "SaveImage",
      inputs: {
        filename_prefix: "ControlNet",
        images: ["8", 0],
      },
    },
    "10": {
      class_type: "ControlNetApplyAdvanced",
      inputs: {
        strength: 1.0,
        start_percent: 0,
        end_percent: 1,
        positive: ["6", 0],
        negative: ["7", 0],
        control_net: ["11", 0],
        image: ["1", 0],
      },
    },
    "11": {
      class_type: "ControlNetLoader",
      inputs: {
        control_net_name: "control_v11p_sd15_openpose.pth",
      },
    },
  },
};

/**
 * Face Swap Workflow
 */
export const FACE_SWAP: WorkflowTemplate = {
  name: "Face Swap",
  description: "Swap face from source to target image",
  category: "image",
  inputs: [
    { name: "sourceImage", type: "image", nodeId: "1", inputKey: "image", required: true, description: "Face to use" },
    { name: "targetImage", type: "image", nodeId: "2", inputKey: "image", required: true, description: "Target image" },
  ],
  outputs: [{ name: "image", type: "image", nodeId: "4" }],
  workflow: {
    "1": {
      class_type: "LoadImage",
      inputs: {
        image: "",
      },
    },
    "2": {
      class_type: "LoadImage",
      inputs: {
        image: "",
      },
    },
    "3": {
      class_type: "ReActorFaceSwap",
      inputs: {
        enabled: true,
        swap_model: "inswapper_128.onnx",
        facedetection: "retinaface_resnet50",
        face_restore_model: "codeformer.pth",
        face_restore_visibility: 1,
        codeformer_weight: 0.5,
        input_image: ["2", 0],
        source_image: ["1", 0],
      },
    },
    "4": {
      class_type: "SaveImage",
      inputs: {
        filename_prefix: "FaceSwap",
        images: ["3", 0],
      },
    },
  },
};

/**
 * All available workflow templates
 */
export const WORKFLOW_TEMPLATES: Record<string, WorkflowTemplate> = {
  "sdxl-text-to-image": SDXL_TEXT_TO_IMAGE,
  "image-upscale-4x": IMAGE_UPSCALE_4X,
  "image-inpaint": IMAGE_INPAINT,
  "animatediff-video": ANIMATEDIFF_VIDEO,
  "image-to-video": IMAGE_TO_VIDEO,
  "controlnet-pose": CONTROLNET_POSE,
  "face-swap": FACE_SWAP,
};

/**
 * Get workflow template by name
 */
export function getWorkflowTemplate(name: string): WorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES[name];
}

/**
 * List all available workflow templates
 */
export function listWorkflowTemplates(): Array<{ name: string; description: string; category: string }> {
  return Object.entries(WORKFLOW_TEMPLATES).map(([key, template]) => ({
    name: key,
    description: template.description,
    category: template.category,
  }));
}

/**
 * Apply inputs to workflow template
 */
export function applyInputsToWorkflow(template: WorkflowTemplate, inputs: Record<string, any>): ComfyWorkflow {
  const workflow = JSON.parse(JSON.stringify(template.workflow)) as ComfyWorkflow;

  for (const input of template.inputs) {
    const value = inputs[input.name] ?? input.default;
    if (value !== undefined && workflow[input.nodeId]) {
      workflow[input.nodeId].inputs[input.inputKey] = value;
    }
  }

  // Apply random seed if not specified
  for (const [nodeId, node] of Object.entries(workflow)) {
    if (node.class_type === "KSampler" && node.inputs.seed === 0) {
      node.inputs.seed = Math.floor(Math.random() * 1000000000);
    }
  }

  return workflow;
}
