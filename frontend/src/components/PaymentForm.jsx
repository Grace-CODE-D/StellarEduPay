import { useState } from 'react';
import { getStudent, getPaymentInstructions } from '../services/api';

export default function PaymentForm() {
  const [studentId, setStudentId] = useState('');
  const [student, setStudent] = useState(null);
  const [instructions, setInstructions] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const [stuRes, instrRes] = await Promise.all([
        getStudent(studentId),
        getPaymentInstructions(studentId),
      ]);
      setStudent(stuRes.data);
      setInstructions(instrRes.data);
    } catch {
      setError('Student not found. Please check the ID.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 480, margin: '2rem auto', fontFamily: 'sans-serif' }}>
      <h2>Pay School Fees</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Enter Student ID (e.g. STU1023)"
          value={studentId}
          onChange={e => setStudentId(e.target.value)}
          required
          style={{ width: '100%', padding: '0.5rem', marginBottom: '0.5rem' }}
        />
        <button type="submit" disabled={loading} style={{ padding: '0.5rem 1rem' }}>
          {loading ? 'Loading...' : 'Get Payment Instructions'}
        </button>
      </form>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      {student && instructions && (
        <div style={{ marginTop: '1.5rem', background: '#f5f5f5', padding: '1rem', borderRadius: 8 }}>
          <p><strong>Student:</strong> {student.name} — Class {student.class}</p>
          <p><strong>Required Fee:</strong> {student.feeAmount} XLM <span style={{ fontSize: '0.8rem', color: '#888' }}>(class fee)</span></p>
          <p><strong>Status:</strong> {student.feePaid ? '✅ Paid' : '❌ Unpaid'}</p>
          <hr />
          <p><strong>Send payment to:</strong></p>
          <code style={{ wordBreak: 'break-all' }}>{instructions.walletAddress}</code>
          <p><strong>Memo (required):</strong> <code>{instructions.memo}</code></p>
          <p style={{ fontSize: '0.85rem', color: '#555' }}>{instructions.note}</p>
        </div>
      )}
    </div>
  );
}
