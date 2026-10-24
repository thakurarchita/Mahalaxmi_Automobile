export default function LogoMark({ small = false }) {
  return (
    <svg width={small ? 43 : 48} height={small ? 36 : 40} viewBox="0 0 48 40" aria-hidden="true">
      <path d="M5 20c2.8-8.5 9.2-13 19-13s16.2 4.5 19 13" fill="none" stroke="#ad2428" strokeWidth="3" strokeLinecap="round" />
      <path d="M8 21h32l4 7H4z" fill="#202327" />
      <circle cx="13" cy="29" r="3.2" fill="#fff" stroke="#202327" strokeWidth="1.5" />
      <circle cx="35" cy="29" r="3.2" fill="#fff" stroke="#202327" strokeWidth="1.5" />
      <path d="M13 18h22" stroke="#ad2428" strokeWidth="2" />
      {!small && <text x="24" y="38" textAnchor="middle" fontSize="5" fontWeight="700" fill="#ad2428">MAHALAXMI</text>}
    </svg>
  )
}
