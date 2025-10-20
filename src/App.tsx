import { useState } from "react";
import LinkGame from "./components/link-game";
import LetterTracing from "./components/letter-tracing";
import "./App.css";

function App() {
  const [isLetterTracing, setIsLetterTracing] = useState(false);
  const [isLinkGame, setIsLinkGame] = useState(false);

  if (isLetterTracing) {
    return <LetterTracing letter="A" />;
  }
  if (isLinkGame) {
    return <LinkGame />;
  }
  return (
    <>
      <h1 onClick={() => setIsLetterTracing(true)}>字母临摹</h1>
      <h1 onClick={() => setIsLinkGame(true)}>连连看游戏</h1>
    </>
  );
}

export default App;
