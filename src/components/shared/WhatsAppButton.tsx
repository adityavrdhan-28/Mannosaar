'use client';

const WhatsAppButton = () => {
  const phone = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER?.replace(/\D/g, '');
  if (!phone || !/^\d{7,15}$/.test(phone)) return null;
  const whatsappLink = `https://wa.me/${phone}?text=${encodeURIComponent("Hi, I'd like to book a session.")}`;

  return (
    <a
      href={whatsappLink}
      aria-label="Book on WhatsApp"
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-8 right-8 z-40 w-14 h-14 bg-green-500 rounded-full flex items-center justify-center shadow-lg hover:shadow-2xl transition-shadow group"
    >
      {/* Pulse background */}
      <div
        className="absolute inset-0 bg-green-500 rounded-full opacity-20"
      />

      <div
        className="absolute inset-0 bg-green-500 rounded-full opacity-10"
      />

      {/* Icon */}
      <div className="relative z-10 text-white text-2xl flex items-center justify-center">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.67-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.076 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421-7.403h-.004c-1.052 0-2.082.264-2.95.734L5.904 3.558 6.653 5.7c-.423.747-.646 1.595-.646 2.478 0 2.237 1.216 4.338 3.383 5.471 1.032.573 2.181.904 3.408.904 2.237 0 4.338-1.216 5.471-3.383.534-.954.856-2.035.856-3.197 0-2.237-1.216-4.338-3.383-5.471-.954-.534-2.035-.856-3.197-.856"/>
        </svg>
      </div>

      {/* Tooltip */}
      <div className="absolute bottom-full right-0 mb-3 px-3 py-1 bg-gray-800 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        Book on WhatsApp
      </div>
    </a>
  );
};

export default WhatsAppButton;
