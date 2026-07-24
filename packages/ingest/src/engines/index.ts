import { PaddleUnavailableError, paddleOcrImages } from "./paddle.js";
import { tesseractEngine } from "./tesseract.js";
import type { OcrEngineOptions, OcrRun, Warning } from "../types.js";

/**
 * Choose which recognition engine actually runs, and say so when the choice was forced.
 *
 * Two engines read pictures here and they are not equals. PP-OCR reads dense text and figures far
 * better, and it sits behind a large optional package with a native component that plenty of
 * people will not have installed and should not have to. Tesseract is a plain dependency that is
 * always present. Neither wins everywhere: the measured exception is a page that is even slightly
 * rotated, which Tesseract reads better than PP-OCR does. `evals/README.md` holds the run.
 *
 * PP-OCR is preferred anyway, because the failure that costs something is a misread figure and
 * that is the dimension it wins by the widest margin. Preferring it is a judgement, and it is
 * recorded as one in `docs/DECISIONS.md` rather than dressed up as an obvious fact.
 *
 * That gap is the entire reason this file exists. Falling back quietly would produce the failure
 * this package is built to avoid: text that is subtly wrong reads exactly like text that is
 * right, so a downgrade that nobody is told about turns into a deck of misquoted numbers with no
 * trace of where they came from. So the fallback is allowed, and it is always announced.
 *
 * The other half of the job is refusing to fall back for the wrong reason. An engine that loaded
 * and then failed to read has a real problem, and catching that would hide a genuine bug behind a
 * worse result and a reassuring warning. Only the absent package counts, which is why the adapter
 * raises a type for exactly that case and this file matches on the type rather than on a message.
 */

/** What the registry returns: the recognition, plus anything the caller has to be told about it. */
export interface EngineRun {
  run: OcrRun;
  /** Empty when the preferred engine ran. Never dropped: the pipeline attaches these to the result. */
  warnings: Warning[];
}

/**
 * Read the images with the best engine this machine can actually run.
 *
 * The adapter imports its optional package dynamically, which is the point rather than an
 * optimisation: a static import would load that package on every run of this one, including the
 * runs that never touch a scan, and turn an optional dependency into a required one.
 */
export async function runBestEngine(images: Uint8Array[], opts: OcrEngineOptions = {}): Promise<EngineRun> {
  try {
    return { run: await paddleOcrImages(images, opts), warnings: [] };
  } catch (error) {
    // The engine loaded and then failed, or something else is wrong with this installation.
    // Either way it is a real error and it belongs to the caller, not to a warning.
    if (!(error instanceof PaddleUnavailableError)) throw error;

    const run = await tesseractEngine(images, opts);
    return {
      run,
      warnings: [
        {
          code: "engine_unavailable",
          // What is missing is taken from the error rather than written down here. The adapter
          // needs more than one optional package, and naming the wrong one sends the reader to
          // install something they already have.
          message:
            `the PP-OCR engine could not be loaded because ${error.missingPackage} is not ` +
            `installed, so ${run.engine} read this document instead. It reads dense text and ` +
            `figures noticeably worse, so check any figure that matters before you send it. ` +
            `Install ${error.missingPackage} to read with PP-OCR instead.`,
        },
      ],
    };
  }
}
