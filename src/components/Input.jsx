export default function Input() {
  return <div>Input</div>;
}
function downloadFile() {
  // 1. Default header line
  let content = "UTILITY, COMPANY, CONSUMER NO, MOBILE NUMBER\n";

  // 2. Add sample entries
  const entries = [];
  for (let i = 0; i < 30; i++) {
    let entry = `${data.utitlity}, ${data.company}, ${data.consumerNo[i]}, ${data.mobileNo[i]}`;
    entries.splice(i, 0, entry);
  }
  // 3. Join entries with new lines
  content += entries.join("\n");

  // 4. Create a Blob file (plain text)
  const blob = new Blob([content], { type: "text/plain" });

  // 5. Create download link
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  const name = Math.random();
  link.download = `${name}.txt`;
  link.click();
}
