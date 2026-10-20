import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
// The bundled headless shell does not unpack under very long Windows paths; use the installed Chrome.
if (process.platform === "win32") Config.setBrowserExecutable("C:/Program Files/Google/Chrome/Application/chrome.exe");
