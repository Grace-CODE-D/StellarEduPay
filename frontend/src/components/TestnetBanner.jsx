// Only renders when NEXT_PUBLIC_STELLAR_NETWORK is explicitly 'testnet'.
// Undefined or any other value (e.g. 'mainnet') will suppress the banner.
export default function TestnetBanner() {
  if (process.env.NEXT_PUBLIC_STELLAR_NETWORK !== 'testnet') {
    return null;
  }

  return (
    <div
      role="alert"
      style={{
        background: '#f59e0b',
        color: '#1c1917',
        textAlign: 'center',
        padding: '8px',
        fontWeight: 600,
        fontSize: '0.875rem',
      }}
    >
      ⚠ You are connected to the Stellar Testnet. No real transactions will be processed.
    </div>
  );
}
