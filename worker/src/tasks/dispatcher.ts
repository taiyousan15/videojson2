import { prisma } from "../db";
import { JobType } from "../../../shared/types";
import { runIngest } from "../jobs/ingest";
import { runAnalyze } from "../jobs/analyze";
import { runOcr } from "../jobs/ocr";
import { runEmbed } from "../jobs/embed";
import { runHighlight } from "../jobs/highlight";
import { runRender } from "../jobs/render";
import { runAssemble } from "../jobs/assemble";
import { runTrain } from "../jobs/train";
import { runGenerate } from "../jobs/generate";
import { runComfyUI } from "../jobs/comfyui";
import { runFaceSwap } from "../jobs/faceswap";

export async function dispatch(jobId: string, jobType: JobType): Promise<void> {
  // Idempotency check
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  if (job.status === "SUCCEEDED") {
    console.log(`Job ${jobId} already succeeded, skipping`);
    return;
  }

  if (job.status === "CANCELED") {
    console.log(`Job ${jobId} was canceled, skipping`);
    return;
  }

  // Dispatch to appropriate handler
  switch (jobType) {
    case "INGEST":
      await runIngest(jobId);
      break;
    case "ANALYZE":
      await runAnalyze(jobId);
      break;
    case "OCR":
      await runOcr(jobId);
      break;
    case "EMBED":
      await runEmbed(jobId);
      break;
    case "HIGHLIGHT":
      await runHighlight(jobId);
      break;
    case "RENDER":
      await runRender(jobId);
      break;
    case "ASSEMBLE":
      await runAssemble(jobId);
      break;
    case "TRAIN":
      await runTrain(jobId);
      break;
    case "GENERATE":
      await runGenerate(jobId);
      break;
    case "COMFYUI":
      await runComfyUI(jobId);
      break;
    case "FACE_SWAP":
      await runFaceSwap(jobId);
      break;
    default:
      throw new Error(`Unknown job type: ${jobType}`);
  }
}
