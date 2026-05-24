import React, { useContext } from 'react';
import { DataContext } from '../data/DataContext.jsx';

const Performance = () => {
  const { data, status } = useContext(DataContext);

  if (status === 'loading') return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'#60a5fa', fontSize:14 }}>Loading...</div>;
  if (status === 'error')   return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'#ef4444', fontSize:14 }}>Error connecting to database.</div>;

  const week  = data.week  || {};
  const today = data.today || {};

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ background:'#0d1f38', border:'1px solid #1e3a5f', borderRadius:10, padding:24, textAlign:'center' }}>
        <div style={{ fontSize:32, marginBottom:12 }}>📊</div>
        <div style={{ fontSize:18, fontWeight:700, color:'#e2e8f0', marginBottom:8 }}>Performance</div>
        <div style={{ fontSize:13, color:'#94a3b8', marginBottom:20 }}>Live data connected — full UI coming from developer.</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, maxWidth:500, margin:'0 auto' }}>
          <div style={{ background:'#071428', borderRadius:8, padding:'12px 16px' }}>
            <div style={{ fontSize:10, color:'#475569', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:4 }}>Calls This Week</div>
            <div style={{ fontSize:28, fontWeight:700, color:'#60a5fa' }}>{week.calls_this_week ?? 0}</div>
          </div>
          <div style={{ background:'#071428', borderRadius:8, padding:'12px 16px' }}>
            <div style={{ fontSize:10, color:'#475569', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:4 }}>Meetings This Week</div>
            <div style={{ fontSize:28, fontWeight:700, color:'#22c55e' }}>{week.meetings_this_week ?? 0}</div>
          </div>
          <div style={{ background:'#071428', borderRadius:8, padding:'12px 16px' }}>
            <div style={{ fontSize:10, color:'#475569', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:4 }}>Conversations</div>
            <div style={{ fontSize:28, fontWeight:700, color:'#a5b4fc' }}>{week.conv_this_week ?? 0}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Performance;
