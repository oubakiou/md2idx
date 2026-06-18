//#region src/md2idx.d.ts
interface Md2idxResult {
  index: string;
  sections: string[];
}
declare const md2idx: (markdown: string) => Md2idxResult;
//#endregion
export { md2idx };