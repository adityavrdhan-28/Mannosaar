'use client';

import Image from 'next/image';
import Link from 'next/link';

export default function Footer() {
  return (
    <footer id="contact" className="bg-[#cbb7df] py-12 text-[#34213f]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Brand Name */}
        <div className="mb-8 text-center">
          <div className="flex items-center justify-center gap-3">
            <Image
              src="/mannosaar_logog_only.png"
              alt="Mannosaar logo"
              width={42}
              height={42}
              className="h-10 w-10 object-contain"
            />
            <h3 className="font-playfair text-2xl font-bold">MANNOSAAR</h3>
          </div>
          <p className="mt-2 text-sm font-medium tracking-wide text-[#34213f]/80">Heal • Grow • Transform</p>
          <p className="mt-1 text-sm text-[#34213f]/80">Mental Health & Wellness Platform</p>
        </div>

        {/* Contact Info */}
        <div className="mb-6 border-b border-[#34213f]/20 pb-6 text-center">
          <p className="text-sm text-[#34213f]/80">
            Email: <a href="mailto:care@mannosaar.com" className="font-medium text-[#34213f] transition-colors hover:text-[#5b267a]">care@mannosaar.com</a>
          </p>
          <p className="mt-2 text-sm text-[#34213f]/80">
            Phone: <a href="tel:+917080633396" className="font-medium text-[#34213f] transition-colors hover:text-[#5b267a]">+91 70806 33396</a>
          </p>
        </div>

        {/* Links */}
        <div className="space-y-3 border-t border-[#34213f]/20 pt-6 text-center text-sm">
          <div className="mx-auto flex max-w-2xl flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap sm:gap-6">
            <Link
              href="/terms"
              className="font-medium text-[#34213f]/85 underline decoration-[#5b267a]/35 underline-offset-4 transition-colors hover:text-[#5b267a]"
            >
              Terms & Conditions
            </Link>
            <Link
              href="/privacy"
              className="font-medium text-[#34213f]/85 underline decoration-[#5b267a]/35 underline-offset-4 transition-colors hover:text-[#5b267a]"
            >
              Privacy Policy
            </Link>
            <Link
              href="/refund-policy"
              className="font-medium text-[#34213f]/85 underline decoration-[#5b267a]/35 underline-offset-4 transition-colors hover:text-[#5b267a]"
            >
              Refund Policy
            </Link>
          </div>

          {/* Copyright */}
          <div className="mt-6 text-xs text-[#34213f]/65">
            <p>&copy; 2026 MANNOSAAR. All rights reserved.</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
