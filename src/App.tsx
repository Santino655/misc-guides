import { Outlet } from 'react-router-dom';

export default function App() {
  return (
    <div>
      <nav>{/* tu nav */}</nav>
      <Outlet />
    </div>
  );
}
