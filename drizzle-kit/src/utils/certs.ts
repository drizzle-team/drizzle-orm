import { $ } from "zx";
import { join } from "path";
import envPaths from "env-paths";
import { access, readFile } from "fs/promises";
import { mkdirSync } from "fs";

const p = envPaths("drizzle-studio", {
  suffix: "",
});

$.verbose = false;
$.cwd = p.data;
mkdirSync(p.data, { recursive: true });

export const certs = async () => {
  const res = await $`mkcert --help`.nothrow();

  // ~/.local/share/drizzle-studio
  const keyPath = join(p.data, "localhost-key.pem");
  const certPath = join(p.data, "localhost.pem");

  if (res.exitCode === 0) {
    try {
      await Promise.all([access(keyPath), access(certPath)]);
    } catch (e) {
      await $`mkcert localhost`.nothrow();
    }
    const [key, cert] = await Promise.all([
      readFile(keyPath, { encoding: "utf-8" }),
      readFile(certPath, { encoding: "utf-8" }),
    ]);
    return key && cert ? { key, cert } : null;
  }
  return null;
};

certs();
