# Tethered — Difficulty Simulation Results

Final configuration (after the independent review fixes). 200 runs per skill level per mode; bot pairs as defined in `src/sim/bots.js` (human models, fixed before tuning). Reproduce with `node tools/sim.mjs --runs 200`.

## Targets vs results

| Target | Result | Met |
|---|---|---|
| Survival — weak pair usually reaches wave 4 | 69% reach wave 4 (median wave 4) | ✅ |
| Survival — average pair clears 30–50% | 35% clear | ✅ |
| Survival — strong pair clears most of the time | 99% clear | ✅ |
| Survival — strong pair rarely gets 3 stars | 8% of runs get 3★ | ✅ |
| Endless — weak pair survives ≥ 3 waves | 96% of runs | ✅ |
| Endless — average median run 4–8 min | median 5:28 | ✅ |
| Endless — strong rarely survives past 15 min | 0% of runs > 15 min (median 10:22, p90 11:35) | ✅ |

## Raw summary (final)

```

=== SURVIVAL ===
weak     clear 0%  stars 1/2/3 = 0/0/0  reach≥4 69%  median wave 4  median time 2:19  win time 0:00  win score med 0 p90 0
         died on wave 1..10: 0 10 52 64 57 16 1 0 0 0   | hits/run: drifter 3.6, dasher 1.7, splitter 0.2, mini 0.1, shot 0.1, spitter 0.0
average  clear 35%  stars 1/2/3 = 62/8/0  reach≥4 100%  median wave 10  median time 7:52  win time 7:57  win score med 21770 p90 23247
         died on wave 1..10: 0 0 0 0 1 3 1 4 33 88   | hits/run: shot 2.9, drifter 1.6, dasher 1.6, beam 0.9, boss 0.8, bossShot 0.7, mini 0.3, brute 0.2, splitter 0.2, spitter 0.0
strong   clear 99%  stars 1/2/3 = 8/174/15  reach≥4 100%  median wave 10  median time 7:18  win time 7:18  win score med 21992 p90 23015
         died on wave 1..10: 0 0 0 0 0 3 0 0 0 0   | hits/run: dasher 0.4, shot 0.4, drifter 0.3, mini 0.2, boss 0.1, bossShot 0.1, brute 0.1, beam 0.1, splitter 0.0

=== ENDLESS ===
weak     time median 2:04 (p10 1:16, p90 3:06)  >15min 0.0%  ≥3 waves 96%  waves median 4 p90 5  score med 2988
         hits/run: drifter 4.4, dasher 1.1, shot 0.7, splitter 0.3, mini 0.2, spitter 0.0, brute 0.0
average  time median 5:28 (p10 4:12, p90 6:55)  >15min 0.0%  ≥3 waves 100%  waves median 9 p90 11  score med 14751
         hits/run: shot 2.8, drifter 2.3, dasher 1.4, beam 0.7, bossShot 0.5, boss 0.5, mini 0.3, splitter 0.1, brute 0.1, spitter 0.0
strong   time median 10:22 (p10 8:40, p90 11:35)  >15min 0.0%  ≥3 waves 100%  waves median 14 p90 15  score med 45186
         hits/run: drifter 3.2, shot 2.6, dasher 1.6, mini 0.7, beam 0.3, boss 0.3, bossShot 0.2, brute 0.2, splitter 0.2, spitter 0.0
(1200 runs in 43.7s on 9 workers)
```

## Before the review fixes (v1, for comparison)

```

=== SURVIVAL ===
weak     clear 0%  stars 1/2/3 = 0/0/0  reach≥4 70%  median wave 4  median time 2:23  win time 0:00  win score med 0 p90 0
         died on wave 1..10: 0 5 56 72 45 18 4 0 0 0   | hits/run: drifter 3.7, dasher 1.7, splitter 0.2, shot 0.2, mini 0.1, brute 0.0, spitter 0.0
average  clear 40%  stars 1/2/3 = 31/45/3  reach≥4 100%  median wave 10  median time 7:52  win time 7:57  win score med 21818 p90 23208
         died on wave 1..10: 0 0 0 1 1 4 2 1 27 85   | hits/run: shot 2.6, drifter 1.7, dasher 1.5, beam 0.9, boss 0.7, bossShot 0.7, mini 0.3, brute 0.2, splitter 0.1, spitter 0.0
strong   clear 95%  stars 1/2/3 = 2/177/11  reach≥4 100%  median wave 10  median time 7:15  win time 7:15  win score med 21946 p90 23001
         died on wave 1..10: 0 0 0 0 0 4 2 1 3 0   | hits/run: shot 0.6, dasher 0.3, drifter 0.3, boss 0.2, mini 0.1, bossShot 0.1, brute 0.1, beam 0.1, splitter 0.0

=== ENDLESS ===
weak     time median 2:14 (p10 1:24, p90 3:11)  >15min 0.0%  ≥3 waves 98%  waves median 4 p90 6  score med 3246
         hits/run: drifter 4.1, dasher 1.3, shot 0.9, splitter 0.3, mini 0.3, spitter 0.0, brute 0.0
average  time median 5:32 (p10 4:26, p90 7:02)  >15min 0.0%  ≥3 waves 100%  waves median 9 p90 11  score med 15174
         hits/run: drifter 2.5, shot 2.3, dasher 1.3, beam 0.8, bossShot 0.6, boss 0.6, mini 0.3, splitter 0.1, brute 0.1, spitter 0.0
strong   time median 10:21 (p10 8:30, p90 11:42)  >15min 0.0%  ≥3 waves 100%  waves median 14 p90 15  score med 44661
         hits/run: drifter 3.2, shot 2.6, dasher 1.5, mini 0.6, beam 0.4, boss 0.3, bossShot 0.3, brute 0.3, splitter 0.2, spitter 0.0
(1200 runs in 39.4s on 9 workers)
```

The v1 star counts used the old score-based 3★ rule. Tuning history and the reasoning behind each change are in the Word design document (section 10) and PROGRESS.md.
