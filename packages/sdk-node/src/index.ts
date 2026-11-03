import process from "node:process";
import { JericoClient, type JericoClientOptions } from "@jerico/sdk-core";

export type NodeJericoOptions = JericoClientOptions & {
  captureUnhandledRejections?: boolean;
};

export class NodeJericoClient extends JericoClient {
  private readonly onUnhandledRejection = (reason: unknown): void => {
    if (reason instanceof Error) this.captureError(reason, { source: "node.unhandledRejection" });
    else this.track("node.unhandled_rejection", {
      reason: typeof reason === "string" ? reason.slice(0, 1000) : "Non-error rejection",
    });
  };

  constructor(options: NodeJericoOptions) {
    if (!options.apiKey.startsWith("jk_sec_")) {
      throw new Error("The Node SDK requires a secret Jerico key (jk_sec_).");
    }
    super(options);
    if (options.captureUnhandledRejections) {
      process.on("unhandledRejection", this.onUnhandledRejection);
    }
  }

  override async close(): Promise<void> {
    process.removeListener("unhandledRejection", this.onUnhandledRejection);
    await super.close();
  }
}

export function createNodeClient(options: NodeJericoOptions): NodeJericoClient {
  return new NodeJericoClient(options);
}
