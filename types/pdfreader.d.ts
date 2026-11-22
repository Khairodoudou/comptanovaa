declare module 'pdfreader' {
  export class PdfReader {
    constructor(options?: any);
    parseBuffer(buffer: Buffer, callback: (err: any, item?: any) => void): void;
    parseFileItems(filename: string, callback: (err: any, item?: any) => void): void;
  }
  export class Rule {
    constructor();
  }
}
