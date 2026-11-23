import React from 'react';
import Svg, { Circle, Line, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { T } from './ui';
import { F, useTheme } from '../theme';

/** Estimated 1RM per session, oldest first, with the latest value in a bubble. */
export function E1rmChart({ points, color }: { points: { date: string; v: number }[]; color: string }) {
  const t = useTheme();
  const W = 320, H = 150, P = 28;
  if (points.length === 0) return <T style={{ color: t.mute, fontSize: 13 }}>لسه مفيش تسجيل للتمرين ده.</T>;
  const vs = points.map((p) => p.v);
  const min = Math.floor(Math.min(...vs) * 0.95), max = Math.ceil(Math.max(...vs) * 1.05) || 1;
  const x = (i: number) => (points.length === 1 ? W / 2 : P + (i * (W - P * 2)) / (points.length - 1));
  const y = (v: number) => H - P - ((v - min) / Math.max(1, max - min)) * (H - P * 1.6);
  const li = points.length - 1;
  const lv = String(points[li].v);
  const bw = lv.length * 7 + 14;
  const bx = Math.min(W - bw - 2, Math.max(2, x(li) - bw / 2));
  const by = Math.max(0, y(points[li].v) - 30);
  const grid = [0, 0.5, 1].map((f) => min + (max - min) * f);
  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
      {grid.map((g, i) => (
        <Line key={i} x1={P} x2={W - P} y1={y(g)} y2={y(g)} stroke={t.line} strokeWidth={1} />
      ))}
      <Line x1={x(li)} x2={x(li)} y1={by + 20} y2={H - P} stroke={color} strokeWidth={1.2} strokeDasharray="3 3" />
      <SvgText x={P - 4} y={y(max) + 4} fontSize={10} fill={t.mute} textAnchor="end" fontFamily={F.numRegular}>{String(max)}</SvgText>
      <SvgText x={P - 4} y={y(min) + 4} fontSize={10} fill={t.mute} textAnchor="end" fontFamily={F.numRegular}>{String(min)}</SvgText>
      <Polyline points={points.map((p, i) => `${x(i)},${y(p.v)}`).join(' ')} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" />
      {points.map((p, i) => (
        <Circle key={i} cx={x(i)} cy={y(p.v)} r={4} fill={color} stroke={t.card} strokeWidth={2} />
      ))}
      <Rect x={bx} y={by} width={bw} height={20} rx={10} fill={color} />
      <SvgText x={bx + bw / 2} y={by + 14} fontSize={11} fill="#FFFFFF" textAnchor="middle" fontFamily={F.numBold}>{lv}</SvgText>
      <SvgText x={x(0)} y={H - 8} fontSize={10} fill={t.mute} textAnchor="middle" fontFamily={F.numRegular}>{points[0].date.slice(5)}</SvgText>
      {points.length > 1 ? (
        <SvgText x={x(points.length - 1)} y={H - 8} fontSize={10} fill={t.mute} textAnchor="middle" fontFamily={F.numRegular}>{points[points.length - 1].date.slice(5)}</SvgText>
      ) : null}
    </Svg>
  );
}
