const deploymentRole = process.env.NANODUCK_DEPLOYMENT_ROLE ?? "application";
if (deploymentRole === "preview") {
  await import("./preview-server.mjs");
} else if (deploymentRole === "application") {
  await import("./migrate.mjs");
  await import("./index.mjs");
} else {
  throw new Error("NANODUCK_DEPLOYMENT_ROLE must be application or preview.");
}
