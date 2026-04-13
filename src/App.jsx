import { useState } from "react";

export default function App() {
  const [count, setCount] = useState(0);

  return (
    <div style={{ padding: 20, fontFamily: "Arial" }}>
      <h1>Bohboo Gift 🎁</h1>
      <p>React app is working 🚀</p>
      <button onClick={() => setCount(count + 1)}>
        Clicked {count} times
      </button>
    </div>
  );
}
