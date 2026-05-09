"use client";

import { SessionProvider } from "next-auth/react";
import { Toaster } from "react-hot-toast";

const ClientLayout = ({ children }) => {
  return (
    <SessionProvider>
      {children}
      <Toaster position="bottom-right" toastOptions={{ duration: 3000 }} />
    </SessionProvider>
  );
};

export default ClientLayout;
