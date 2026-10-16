import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { Feedback } from "./Feedback";

function App() {
  const [n, setN] = useState(0);
  return (
    <main>
      <section data-section="hero"><h1>React sample</h1><p>Clicked {n} times.</p><button onClick={() => setN(n + 1)}>Click me</button></section>
      <section data-section="about"><h2>About</h2><p>A page to leave a pin on.</p></section>
      <Feedback />
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
