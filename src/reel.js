// Vật lý pha kéo cá – module thuần (không phụ thuộc 3D/DOM), dùng chung cho game và tools/reel-sim.mjs.
//
// Mô hình: lực căng T (0..1) tiến dần về một "mục tiêu".
//   Giữ  → mục tiêu = holdBase (+ lực giật khi cá vùng vẫy)  → cuộn dây, quãng dây D giảm.
//   Thả  → mục tiêu = releaseBase (+ lực giật)               → dây chùng, cá kéo D tăng.
// T ≥ redMin tích "căng quá" (strain); strain ≥ độ chịu của cần → đứt dây. D ≥ maxD → cá sổng.
// Độ khó tương đối e = Độ khó − Lực cần + 2 (0..4 là câu được; >4 = quá sức → gần như chắc chắn đứt).

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/**
 * @param {object} p  { difficulty, legendary, size (0..3), rod {power, redTolerance, reelSpeed}, castPower 0..1 }
 * @param {object} R  balance.reel
 */
export function createReel(p, R, rng = Math.random) {
  const rand = (a, b) => a + rng() * (b - a);
  const d = p.difficulty;
  const e = d - p.rod.power + R.margin;
  const over = Math.max(0, d - p.rod.power - R.margin);
  const ee = clamp(e, 0, 4);
  const sizeF = [0.9, 1, 1.12, 1.3][p.size];
  const D0 = (R.baseDist + R.distPerDiff * d + p.castPower * R.castDistBonus) * (p.size === 3 ? 1.25 : 1) * (p.legendary ? 1.3 : 1);
  return {
    D0, D: D0, maxD: D0 + R.escapeSlack,
    T: 0.4, strain: 0,
    tol: p.rod.redTolerance * (over > 0 ? 0.5 : 1),
    holdBase: R.holdBase + R.holdPerE * ee + over * 0.22,
    thrashForce: (R.thrashBase + R.thrashPerE * ee + over * 0.3) * sizeF + (p.legendary ? 0.06 : 0),
    thrashEvery: Math.max(1.0, R.thrashEveryBase - R.thrashEveryPerE * ee - over * 0.5),
    thrashDur: R.thrashDurBase + R.thrashDurPerE * ee + (p.size === 3 ? 0.2 : 0) + (p.legendary ? 0.25 : 0),
    telegraph: Math.max(0.18, R.telegraphBase - R.telegraphPerE * ee),
    pullOut: R.pullBase + R.pullPerE * ee + over * 1.2,
    reelSpeed: p.rod.reelSpeed,
    nextThrash: rand(1.0, 2.0),
    thrashLeft: 0,
    warned: false,
    feint: false,
    phase: rand(0, 6.28),
    t: 0,
    over,
    ee,
  };
}

/**
 * Tiến một bước. Trả về sự kiện: 'warn' | 'thrash' | 'thrashEnd' | 'snap' | 'escape' | 'landed' | null
 * và cập nhật r.green / r.red / r.reeled (mét cuộn được bước này).
 */
export function stepReel(r, R, dt, holding, rng = Math.random) {
  const rand = (a, b) => a + rng() * (b - a);
  r.t += dt;
  let ev = null;
  if (r.thrashLeft > 0) {
    r.thrashLeft -= dt;
    if (r.thrashLeft <= 0) {
      r.feint = rng() < (R.feintBase + R.feintPerE * r.ee) * (r.over ? 1.5 : 1);
      r.nextThrash = r.feint ? rand(0.35, 0.6) : r.thrashEvery * rand(0.65, 1.35);
      ev = 'thrashEnd';
    }
  } else {
    r.nextThrash -= dt;
    if (!r.warned && r.nextThrash <= (r.feint ? 0.15 : r.telegraph)) {
      r.warned = true;
      ev = 'warn';
    }
    if (r.nextThrash <= 0) {
      r.thrashLeft = r.thrashDur * (r.feint ? 0.7 : 1);
      r.warned = false;
      r.T = Math.min(1.05, r.T + R.kickBase + R.kickPerE * r.ee);
      ev = 'thrash';
    }
  }
  const thrash = r.thrashLeft > 0;
  r.thrash = thrash;
  const wob = Math.sin(r.t * 1.7 + r.phase) * 0.06 + Math.sin(r.t * 4.3 + r.phase) * 0.02;
  const target = holding
    ? r.holdBase + wob + (thrash ? r.thrashForce : 0)
    : R.releaseBase + (thrash ? r.thrashForce * R.releaseThrashMult : 0);
  r.T += (target - r.T) * Math.min(1, (holding ? R.riseRate : R.fallRate) * dt);
  r.T = clamp(r.T + (rng() - 0.5) * 0.012, 0, 1.06);
  r.green = r.T >= R.greenMin && r.T <= R.greenMax;
  r.red = r.T >= R.redMin;
  if (r.red) r.strain += dt;
  else r.strain = Math.max(0, r.strain - dt * R.strainRecover);
  r.reeled = 0;
  if (holding) {
    r.eff = r.green ? 1 : r.red ? 0.3 : 0.6;
    r.reeled = r.reelSpeed * r.eff * (thrash ? 0.35 : 1) * dt;
    r.D -= r.reeled;
  } else {
    r.eff = 0;
    r.D += r.pullOut * (thrash ? R.thrashPullMult : 1) * dt;
  }
  if (r.strain >= r.tol) return 'snap';
  if (r.D >= r.maxD) return 'escape';
  if (r.D <= 0) return 'landed';
  return ev;
}
