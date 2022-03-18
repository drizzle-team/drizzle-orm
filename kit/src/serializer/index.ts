import fs from "fs";
import { StringDecoder } from "string_decoder";
import prepareFabricFile from "./factory";
const esbuild = require("esbuild");

const serialize = (path: string, fileName?: string): string => {
  const decoder = new StringDecoder();
  const preparedFarbic = prepareFabricFile(path, fileName)

  fs.writeFileSync("__out.ts", preparedFarbic, "utf-8");
  const result = esbuild.buildSync({
    entryPoints: ["__out.ts"],
    bundle: true,
    platform: "node",
    write: false,
    external: ["pg-native"],
  });

  fs.unlinkSync("__out.ts");
  return eval(decoder.write(result.outputFiles[0].contents));
};

export default serialize;
