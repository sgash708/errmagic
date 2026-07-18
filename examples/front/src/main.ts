import { initErrmagic, reportError } from "errmagic";

initErrmagic({
  endpoint: "http://localhost:8787/errors",
  app: "my-app",
});

document.getElementById("throw")!.addEventListener("click", () => {
  throw new Error("Example uncaught error");
});

document.getElementById("reject")!.addEventListener("click", () => {
  void Promise.reject(new Error("Example unhandled rejection"));
});

document.getElementById("manual")!.addEventListener("click", () => {
  try {
    JSON.parse("{ not json");
  } catch (err) {
    reportError(err, { userId: "example-user" });
  }
});
