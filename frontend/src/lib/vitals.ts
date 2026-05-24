import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from 'web-vitals';
import { track } from './analytics';

function report(metric: Metric) {
  track('web_vital', {
    name: metric.name,
    value: Math.round(metric.value),
    rating: metric.rating,
    delta: Math.round(metric.delta),
    nav_type: metric.navigationType,
  });
}

let started = false;

/** Wires web-vitals to PostHog. Safe to call multiple times. */
export function startWebVitals(): void {
  if (started) return;
  started = true;
  try {
    onLCP(report);
    onINP(report);
    onCLS(report);
    onFCP(report);
    onTTFB(report);
  } catch (e) {
    console.warn('[vitals] start failed:', e);
  }
}
