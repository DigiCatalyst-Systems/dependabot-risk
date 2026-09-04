// Entry point only. The action itself lives in ./action.ts so that the
// end-to-end test can import and drive `run()` without executing it on import.
import * as core from "@actions/core";
import { run } from "./action.ts";

run().catch((err) => core.setFailed((err as Error).message));
