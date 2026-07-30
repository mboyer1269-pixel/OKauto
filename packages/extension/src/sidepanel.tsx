import { createRoot } from "react-dom/client";
import "./extension.css";

function SidePanel() {
  return (
    <main className="panel">
      <section className="card">
        <h1>Listing workflow guardrails</h1>
        <p>
          OKauto assists with visible-field preparation. You remain in control of account access, posting, edits,
          and removals.
        </p>
        <ul>
          <li>Capture only pages you are permitted to view.</li>
          <li>Review VIN, mileage, price, fees, and availability before publishing.</li>
          <li>Do not use the extension to bypass CAPTCHA, login, rate limits, or platform restrictions.</li>
          <li>Resolve sold alerts quickly so shoppers do not see stale inventory.</li>
          <li>Keep dealership compliance copy and disclosures current.</li>
        </ul>
      </section>
    </main>
  );
}

createRoot(document.getElementById("sidepanel-root")!).render(<SidePanel />);
