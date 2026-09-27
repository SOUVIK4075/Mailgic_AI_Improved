import { Outlet } from 'react-router-dom';
import Footer from './Footer';
import Header from './Header';

export default function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="grow">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
