import fs from "fs";
import path from "path";

async function main() {
  const filePath = path.resolve("C:/Users/APPLe/Downloads/Facture commerciale entreprise professionnel simple moderne gris.pdf");
  const buffer = fs.readFileSync(filePath);
  const blob = new Blob([buffer], { type: "application/pdf" });

  const formData = new FormData();
  formData.append("file", blob, "Facture commerciale.pdf");
  formData.append("companyId", "cmow3zh870001cwuog74arb75");

  try {
    const res = await fetch("http://localhost:3000/api/documents/upload", {
      method: "POST",
      body: formData,
    });
    const text = await res.text();
    console.log(res.status, text);
  } catch (err) {
    console.error(err);
  }
}
main();
