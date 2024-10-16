import * as crypto from "crypto";

interface IHashOptions {
  length?: number;
}

/**
* Returns a hashed input.
*
* @param input String to be hashed.
* @param options.length Optionally, shorten the output to desired length.
*/
export function hash(input: string, options: IHashOptions = {}): string {
  const hashFunction = crypto.createHash("sha256");

  hashFunction.update(input, "utf8");

  const hashedInput = hashFunction.digest("hex");

  if (options.length) {
    return hashedInput.slice(0, options.length);
  }

  return hashedInput;
}