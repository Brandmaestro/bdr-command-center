import React, { useContext } from 'react';
import { DataContext } from '../data/DataContext.jsx';

const ProspectingAnalysis = () => {
  const { data, status } = useContext(DataContext);
  if (status === 'loading') return <div style={{ color: '#60a5fa', padding: 40 }}>Loading...</div>;
  if (status === 'error')   return <div style={{ color: '#ef4444', padding: 40 }}>Error connecting.</div>;
  return (
    <div style={{ color: '#475569', fontSize: 13, padding: 40, textAlign: 'center' }}>
      Prospecting Analysis — coming soon
    </div>
  );
};

export default ProspectingAnalysis;
