import { Routes, Route, Link } from "react-router-dom";
import Home from "./routes/Home.tsx";
import About from "./routes/About.tsx";
import NotFound from "./routes/NotFound.tsx";

export default function App() {
  return (
    <div className="app">
      <nav>
        <Link to="/">Inicio</Link>
        <Link to="/about">Acerca de</Link>
        <Link to="/no-existe">Ruta rota</Link>
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  );
}
