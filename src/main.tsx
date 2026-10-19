import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { useRoute } from "./lib/router";
import { initWallet } from "./lib/wallet";
import { initSmoothScroll } from "./lib/smooth";
initSmoothScroll();
import { Footer, Header, Preloader } from "./components/Shell";
import { Toasts } from "./components/ui";
import Home from "./pages/Home";
import Explore from "./pages/Explore";
import AgentPage from "./pages/AgentPage";
import Launch from "./pages/Launch";
import { Capabilities, Docs, How } from "./pages/Info";


function App() {
  const route = useRoute();
  const [intro, setIntro] = useState(false);
  useEffect(() => { initWallet(); }, []);
  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior }); }, [route.path]);
  const finish = () => setIntro(true);

  let page;
  switch (route.parts[0]) {
    case undefined: page = <Home introDone={intro} />; break;
    case "agents": page = <Explore />; break;
    case "agent": page = <AgentPage />; break;
    case "launch": page = <Launch />; break;
    case "capabilities": page = <Capabilities />; break;
    case "how": page = <How />; break;
    case "docs": page = <Docs />; break;
    default: page = <Home introDone={intro} />;
  }
  return (
    <>
      {!intro && <Preloader onDone={finish} />}
      <Header />
      <div key={route.path}>{page}</div>
      <Footer />
      <Toasts />
    </>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
