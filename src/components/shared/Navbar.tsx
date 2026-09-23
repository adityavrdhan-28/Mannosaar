'use client';

import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import { signOut } from 'next-auth/react';
import { useSession } from 'next-auth/react';

interface NavbarProps {
  onLogout?: () => void;
}

const Navbar = ({ onLogout }: NavbarProps) => {
  const { data: session } = useSession();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target as Node)) {
        setIsMobileMenuOpen(false);
      }
    };

    if (isDropdownOpen || isMobileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen, isMobileMenuOpen]);

  const handleLogout = async () => {
    setIsDropdownOpen(false);
    await signOut({ redirect: true, redirectTo: '/' });
    onLogout?.();
  };

  return (
    <nav className="sticky top-0 z-50 border-b border-white/30 bg-[#cbb7df] shadow-sm" suppressHydrationWarning>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group flex-shrink-0">
            <img 
              src="/mannosaar_logog_only.png" 
              alt="Mannosaar" 
              className="w-12 h-12 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6"
            />
            <div className="flex flex-col">
              <span className="text-2xl font-bold text-[#34213f] leading-tight transition-all duration-300 group-hover:text-[#34213f]/75" style={{ fontFamily: 'var(--font-playfair-display)' }}>
                Mannosaar
              </span>
              <span className="text-xs text-[#34213f]/80 font-medium tracking-wide">
                Heal • Grow • Transform
              </span>
            </div>
          </Link>

          {/* Navigation Links - Center (Desktop Only) */}
          <div className="hidden lg:flex items-center space-x-8">
            <Link
              href="/"
              className="text-[#34213f] hover:text-[#34213f]/70 transition-colors font-medium text-sm"
            >
              Home
            </Link>
            <Link
              href="/services"
              className="text-[#34213f] hover:text-[#34213f]/70 transition-colors font-medium text-sm"
            >
              Services
            </Link>
            <Link
              href="/about"
              className="text-[#34213f] hover:text-[#34213f]/70 transition-colors font-medium text-sm"
            >
              About
            </Link>
            <Link
              href="/blogs"
              className="text-[#34213f] hover:text-[#34213f]/70 transition-colors font-medium text-sm"
            >
              Blog
            </Link>
            <Link
              href="/#reviews"
              className="text-[#34213f] hover:text-[#34213f]/70 transition-colors font-medium text-sm"
            >
              Reviews
            </Link>
          </div>

          {/* User Section - Right */}
          <div ref={mobileMenuRef} className="flex items-center gap-4" suppressHydrationWarning>
            <Link
              href="/book-session"
              className="hidden min-h-11 items-center justify-center rounded-full bg-purple-700 px-5 py-2 text-sm font-semibold text-white transition hover:bg-purple-800 hover:shadow-lg lg:inline-flex"
            >
              Book Session
            </Link>
            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMobileMenuOpen((isOpen) => !isOpen)}
              className="flex flex-col gap-1.5 p-2 lg:hidden"
              aria-label="Toggle menu"
              aria-expanded={isMobileMenuOpen}
              suppressHydrationWarning
            >
              <div className={`w-6 h-0.5 bg-[#34213f] transition-all duration-300 ${isMobileMenuOpen ? 'rotate-45 translate-y-2' : ''}`}></div>
              <div className={`w-6 h-0.5 bg-[#34213f] transition-all duration-300 ${isMobileMenuOpen ? 'opacity-0' : ''}`}></div>
              <div className={`w-6 h-0.5 bg-[#34213f] transition-all duration-300 ${isMobileMenuOpen ? '-rotate-45 -translate-y-2' : ''}`}></div>
            </button>

            {isMounted && (
              <>
                {session?.user ? (
                  <div ref={dropdownRef} className="relative">
                    <button
                      onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-white/15 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-purple-500 flex items-center justify-center">
                        <span className="text-sm font-semibold text-white">
                          {(session.user.name || session.user.email || '').charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <span className="text-sm font-medium text-[#34213f] hidden sm:block">
                        {session.user.name || session.user.email?.split('@')[0] || 'User'}
                      </span>
                    </button>

                    {/* Dropdown Menu */}
                    {isDropdownOpen && (
                      <div className="absolute right-0 mt-2 w-48 overflow-hidden rounded-lg border border-white/30 bg-purple-700 shadow-xl">
                        <Link
                          href="/profile"
                          onClick={() => setIsDropdownOpen(false)}
                          className="block px-4 py-2 text-sm text-white hover:bg-white/15 transition-colors"
                        >
                          Profile
                        </Link>
                        {session.user.role === 'admin' && (
                          <Link
                            href="/admin"
                            onClick={() => setIsDropdownOpen(false)}
                            className="block border-t border-white/20 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15 transition-colors"
                          >
                            Admin Panel
                          </Link>
                        )}
                        <button
                          onClick={handleLogout}
                          className="w-full border-t border-white/20 px-4 py-2 text-left text-sm text-white hover:bg-white/15 transition-colors"
                        >
                          Logout
                          </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <Link
                    href="/auth/login"
                    className="rounded-full border border-white/50 bg-purple-700 px-6 py-2 font-medium text-white transition-all hover:bg-purple-800 hover:shadow-lg"
                  >
                    Login
                  </Link>
                )}
              </>
            )}
          </div>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div
            className="mt-4 border-t border-white/25 pb-4 lg:hidden"
            suppressHydrationWarning
          >
            <div className="space-y-2">
              <Link
                href="/"
                onClick={() => setIsMobileMenuOpen(false)}
                className="block rounded-lg px-4 py-3 font-medium text-[#34213f] hover:bg-white/15 transition-colors"
              >
                Home
              </Link>
              <Link
                href="/about"
                onClick={() => setIsMobileMenuOpen(false)}
                className="block rounded-lg px-4 py-3 font-medium text-[#34213f] hover:bg-white/15 transition-colors"
              >
                About
              </Link>
              <Link
                href="/services"
                onClick={() => setIsMobileMenuOpen(false)}
                className="block rounded-lg px-4 py-3 font-medium text-[#34213f] hover:bg-white/15 transition-colors"
              >
                Services
              </Link>
              <Link
                href="/blogs"
                onClick={() => setIsMobileMenuOpen(false)}
                className="block rounded-lg px-4 py-3 font-medium text-[#34213f] hover:bg-white/15 transition-colors"
              >
                Blog
              </Link>
              <Link
                href="/#reviews"
                onClick={() => setIsMobileMenuOpen(false)}
                className="block rounded-lg px-4 py-3 font-medium text-[#34213f] hover:bg-white/15 transition-colors"
              >
                Reviews
              </Link>
              <Link
                href="/book-session"
                onClick={() => setIsMobileMenuOpen(false)}
                className="mt-3 flex min-h-12 items-center justify-center rounded-full bg-purple-700 px-5 py-3 font-semibold text-white transition-colors hover:bg-purple-800"
              >
                Book Session
              </Link>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
