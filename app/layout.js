import { Inter } from "next/font/google";
import { Toaster } from "react-hot-toast";
import "./globals.css";

const font = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "AutoVideo HDR",
  description: "AI-powered real estate photo to video generation",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="dark" className={font.className}>
      <body className="min-h-screen">
        <Toaster position="bottom-right" />
        {children}
      </body>
    </html>
  );
}
