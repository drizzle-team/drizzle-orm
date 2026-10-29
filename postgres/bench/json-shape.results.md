parity (shaped vs JSON.parse, first row):
  OK   small · 3 fields (id,name,active)
  OK   mixed · 6 fields (num/str/bool)
  OK   number-heavy · 6 numeric fields
  OK   string-heavy · 5 text fields (utf8)

precision: raw='9007199254740993'  vs  JSON.parse=9007199254740992  (JSON.parse  the low digits)

clk: ~3.96 GHz
cpu: Apple M4
runtime: bun 1.3.14 (arm64-darwin)

benchmark                      avg (min … max) p75 / p99    (min … top 1%)
---------------------------------------------- -------------------------------
• small · 3 fields (id,name,active) · 1 rows
---------------------------------------------- -------------------------------
readString(utf8) + JSON.parse   152.91 ns/iter 162.10 ns          ▄    ▃▆▇█▃  
                       (126.12 ns … 184.30 ns) 169.67 ns ▂▂▂▆▆▅▅█▇█▇▆▄▄█████▇▂
                     gc(493.83 µs …   3.30 ms)   1.05  b (  0.00  b…216.00  b)

utf8Slice + JSON.parse          171.07 ns/iter 174.84 ns          ▄█▃         
                       (153.48 ns … 223.46 ns) 191.28 ns ▂▄▄▃▃▂▁▃█████▄▃▂▁▁▁▁▁
                     gc(561.54 µs …   1.70 ms)   0.04  b (  0.00  b…  8.00  b)

latin1Slice + JSON.parse        142.10 ns/iter 148.82 ns   ▅█▇▃      ▂▂▂      
                       (131.32 ns … 169.63 ns) 158.56 ns ▂▇████▆▅▃▂▄▆███▇▄▂▃▂▁
                     gc(560.67 µs …   1.22 ms)   0.00  b (  0.00  b…  0.00  b)

shaped positional (monomorphic)  88.76 ns/iter  90.08 ns  █▄                  
                        (82.03 ns … 196.66 ns) 142.93 ns ▆██▇▄▃▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁
                     gc(541.13 µs …   4.98 ms)   0.40  b (  0.00  b…208.00  b)

summary
  shaped positional (monomorphic)
   1.6x faster than latin1Slice + JSON.parse
   1.72x faster than readString(utf8) + JSON.parse
   1.93x faster than utf8Slice + JSON.parse

• small · 3 fields (id,name,active) · 100 rows
---------------------------------------------- -------------------------------
readString(utf8) + JSON.parse    15.90 µs/iter  16.34 µs ▃█               ▃  ▃
                         (15.36 µs … 16.91 µs)  16.54 µs ██▆▁▁▆▆▁▆▆▁▆▁▁▁▆▁█▁▁█
                     gc(  3.26 ms …   4.23 ms) 740.38  b (  0.00  b… 15.14 kb)

utf8Slice + JSON.parse           15.03 µs/iter  15.05 µs  ▃ ▃   █            ▃
                         (14.81 µs … 15.60 µs)  15.33 µs ▆█▆█▆▆▆█▁▆▆▁▁▁▁▁▁▁▆▁█
                     gc(  3.32 ms …   3.94 ms)   0.73  b (  0.00  b… 12.00  b)

latin1Slice + JSON.parse         16.35 µs/iter  17.72 µs ▃        █  ▃       █
                         (13.43 µs … 18.78 µs)  18.74 µs █▁▁▆▆▁▁▁▆█▁▁█▆▁▁▆▁▁▁█
                     gc(  3.42 ms …   5.26 ms)   0.00  b (  0.00  b…  0.00  b)

shaped positional (monomorphic)   7.80 µs/iter   8.64 µs     ▅   █        █   
                           (6.57 µs … 9.11 µs)   9.06 µs ▇▇▇▄█▄▁▄█▁▇▄▄▁▄▄▁█▇▄▇
                     gc(  3.09 ms …   5.04 ms)  82.36  b (  0.00  b…  3.14 kb)

summary
  shaped positional (monomorphic)
   1.93x faster than utf8Slice + JSON.parse
   2.04x faster than readString(utf8) + JSON.parse
   2.09x faster than latin1Slice + JSON.parse

• small · 3 fields (id,name,active) · 1000 rows
---------------------------------------------- -------------------------------
readString(utf8) + JSON.parse   210.80 µs/iter 219.63 µs   █▄     ▂▃          
                       (192.79 µs … 268.83 µs) 246.46 µs ▁▅██▅▄▄▃▄███▄▃▂▂▁▂▁▁▁
                     gc(542.42 µs …   1.47 ms)   0.00  b (  0.00  b…  0.00  b)

utf8Slice + JSON.parse          202.20 µs/iter 211.04 µs  ▂█▇      ▂          
                       (186.79 µs … 288.13 µs) 234.75 µs ▂████▆▃▃▃██▇▇▃▂▃▂▂▂▁▁
                     gc(540.88 µs …   1.14 ms)   0.00  b (  0.00  b…  0.00  b)

latin1Slice + JSON.parse        176.85 µs/iter 179.96 µs  ▅█                  
                       (166.83 µs … 274.46 µs) 215.46 µs ▂███▃▃▂▂▃▄▃▂▂▁▂▁▁▁▁▁▁
                     gc(554.96 µs …   1.48 ms)   0.00  b (  0.00  b…  0.00  b)

shaped positional (monomorphic)  80.43 µs/iter  82.75 µs     ▅▅▆▇██▇▄▂        
                        (71.13 µs … 115.42 µs)  92.29 µs ▁▁▂▅█████████▇▅▄▄▃▂▁▁
                     gc(470.79 µs … 950.17 µs)   0.00  b (  0.00  b…  0.00  b)

summary
  shaped positional (monomorphic)
   2.2x faster than latin1Slice + JSON.parse
   2.51x faster than utf8Slice + JSON.parse
   2.62x faster than readString(utf8) + JSON.parse

• mixed · 6 fields (num/str/bool) · 1 rows
---------------------------------------------- -------------------------------
readString(utf8) + JSON.parse   235.06 ns/iter 239.77 ns         █▆           
                       (213.87 ns … 293.49 ns) 267.33 ns ▃██▅▄▆▇███▇▃▂▃▄▃▄▃▂▂▁
                     gc(510.46 µs …   3.88 ms)   0.27  b (  0.00  b…152.00  b)

utf8Slice + JSON.parse          216.38 ns/iter 218.25 ns       ▃▃▅█▃          
                       (207.27 ns … 239.84 ns) 230.01 ns ▁▂▂▅▅██████▇▅▃▂▂▁▁▁▁▂
                     gc(488.83 µs … 849.00 µs)   0.00  b (  0.00  b…  0.00  b)

latin1Slice + JSON.parse        198.42 ns/iter 200.28 ns         ▂▇█▆▅        
                       (184.76 ns … 220.13 ns) 210.70 ns ▁▁▁▁▁▁▂▇██████▅▃▃▁▁▁▁
                     gc(493.54 µs …   2.17 ms)   0.00  b (  0.00  b…  0.00  b)

shaped positional (monomorphic) 196.32 ns/iter 197.96 ns  █▄                  
                       (175.82 ns … 436.92 ns) 360.79 ns ▄██▇▂▂▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁
                     gc(538.58 µs …   8.13 ms)   2.66  b (  0.00  b…808.00  b)

summary
  shaped positional (monomorphic)
   1.01x faster than latin1Slice + JSON.parse
   1.1x faster than utf8Slice + JSON.parse
   1.2x faster than readString(utf8) + JSON.parse

• mixed · 6 fields (num/str/bool) · 100 rows
---------------------------------------------- -------------------------------
readString(utf8) + JSON.parse    22.69 µs/iter  22.86 µs █  █ █  █ █ ███     █
                         (21.77 µs … 23.87 µs)  23.45 µs █▁▁█▁█▁▁█▁█▁███▁▁▁▁▁█
                     gc(  8.28 ms …  15.96 ms)   1.53 kb (  0.00  b… 21.39 kb)

utf8Slice + JSON.parse           21.96 µs/iter  22.07 µs             █       █
                         (20.99 µs … 22.95 µs)  22.58 µs █▁▁▁█▁▁█▁▁███▁█▁▁▁▁▁█
                     gc(  8.15 ms …  11.93 ms)   0.00  b (  0.00  b…  0.00  b)

latin1Slice + JSON.parse         19.87 µs/iter  20.05 µs     █           █    
                         (19.33 µs … 20.26 µs)  20.24 µs █▁▁▁█▁▁█▁▁█▁▁▁███▁█▁█
                     gc(  8.05 ms …   8.99 ms)   0.00  b (  0.00  b…  0.00  b)

shaped positional (monomorphic)  14.96 µs/iter  15.02 µs           █          
                         (14.43 µs … 15.98 µs)  15.50 µs ▄▄▁▁▄▇▄▁▄▁█▇▁▁▁▁▁▁▄▁▄
                     gc(  6.92 ms …   7.53 ms) 154.86  b (  0.00  b…  3.18 kb)

summary
  shaped positional (monomorphic)
   1.33x faster than latin1Slice + JSON.parse
   1.47x faster than utf8Slice + JSON.parse
   1.52x faster than readString(utf8) + JSON.parse

• mixed · 6 fields (num/str/bool) · 1000 rows
---------------------------------------------- -------------------------------
readString(utf8) + JSON.parse   273.01 µs/iter 289.29 µs     ▅ ▅  ▆  ▇█       
                       (225.13 µs … 360.17 µs) 321.21 µs ▂▄▅▇███▆▇█▄▄██▇▄▅██▃▂
                     gc(436.13 µs …   1.00 ms)   0.00  b (  0.00  b…  0.00  b)

utf8Slice + JSON.parse          298.61 µs/iter 305.79 µs    ▂       ▄▇█       
                       (274.67 µs … 331.83 µs) 321.67 µs ▂▃██▅▃▂▂▂▃█████▅▄▃▃▂▁
                     gc(503.42 µs …   1.04 ms)   0.00  b (  0.00  b…  0.00  b)

latin1Slice + JSON.parse        266.45 µs/iter 276.96 µs   █▅▃                
                       (250.63 µs … 347.38 µs) 293.33 µs ▂████▆▄▂▂▃▃▆█▇█▄▃▃▂▂▁
                     gc(513.04 µs …   1.32 ms)   0.00  b (  0.00  b…  0.00  b)

shaped positional (monomorphic) 193.26 µs/iter 196.46 µs  ▂█▅▅▇▄▄▄            
                       (182.92 µs … 283.58 µs) 214.00 µs ▃████████▇▅▆▅▄▄▃▃▂▂▂▁
                     gc(478.75 µs … 908.42 µs)   0.00  b (  0.00  b…  0.00  b)

summary
  shaped positional (monomorphic)
   1.38x faster than latin1Slice + JSON.parse
   1.41x faster than readString(utf8) + JSON.parse
   1.55x faster than utf8Slice + JSON.parse

• number-heavy · 6 numeric fields · 1 rows
---------------------------------------------- -------------------------------
readString(utf8) + JSON.parse   200.14 ns/iter 202.45 ns   ▅█▇▃               
                       (190.24 ns … 232.13 ns) 222.15 ns ▂▅█████▃▃▂▂▃▃▄▄▄▃▃▂▁▁
                     gc(490.63 µs …   1.49 ms)   0.02  b (  0.00  b…  8.00  b)

utf8Slice + JSON.parse          192.79 ns/iter 195.63 ns          ███▆▃       
                       (179.84 ns … 208.83 ns) 205.39 ns ▂▂▄▅▆▃▄▇██████▆▆▃▃▃▁▂
                     gc(461.08 µs …   2.15 ms)   0.00  b (  0.00  b…  0.00  b)

latin1Slice + JSON.parse        176.64 ns/iter 178.22 ns     █▃▃              
                       (170.79 ns … 205.98 ns) 192.68 ns ▂▆██████▇▄▃▂▂▁▁▁▁▁▁▁▁
                     gc(473.63 µs …   1.82 ms)   0.00  b (  0.00  b…  0.00  b)

shaped positional (monomorphic) 132.37 ns/iter 131.49 ns █▂                   
                       (126.33 ns … 240.16 ns) 233.96 ns ██▅▂▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁
                     gc(488.29 µs …  10.48 ms)   0.46  b (  0.00  b…352.00  b)

summary
  shaped positional (monomorphic)
   1.33x faster than latin1Slice + JSON.parse
   1.46x faster than utf8Slice + JSON.parse
   1.51x faster than readString(utf8) + JSON.parse

• number-heavy · 6 numeric fields · 100 rows
---------------------------------------------- -------------------------------
readString(utf8) + JSON.parse    20.50 µs/iter  21.02 µs    █            █  █ 
                         (19.70 µs … 21.48 µs)  21.11 µs ██▁██▁▁▁▁█▁▁▁▁▁▁█▁▁██
                     gc(  3.23 ms …   4.32 ms) 554.50  b (  0.00  b…  8.66 kb)

utf8Slice + JSON.parse           18.86 µs/iter  18.90 µs ▃  ▃  ▃             █
                         (18.72 µs … 19.10 µs)  18.99 µs █▁▁█▁▆█▆▁▁▆▁▁▆▁▁▁▁▁▁█
                     gc(  3.07 ms …   3.45 ms)   0.00  b (  0.00  b…  0.00  b)

latin1Slice + JSON.parse         16.84 µs/iter  16.87 µs  ██ █  █             
                         (16.73 µs … 17.11 µs)  17.02 µs ███▁████▁█▁▁▁█▁█▁▁▁▁█
                     gc(  3.08 ms …   3.38 ms)   0.00  b (  0.00  b…  0.00  b)

shaped positional (monomorphic)  13.16 µs/iter  13.18 µs     █  ▃  █ ▃       ▃
                         (13.10 µs … 13.24 µs)  13.22 µs ▆▆▁▆█▁▁█▁▁█▁█▆▁▆▁▁▁▆█
                     gc(  7.39 ms …   7.79 ms)  47.83  b (  0.00  b…  1.07 kb)

summary
  shaped positional (monomorphic)
   1.28x faster than latin1Slice + JSON.parse
   1.43x faster than utf8Slice + JSON.parse
   1.56x faster than readString(utf8) + JSON.parse

• number-heavy · 6 numeric fields · 1000 rows
---------------------------------------------- -------------------------------
readString(utf8) + JSON.parse   235.12 µs/iter 258.96 µs       █           ▂  
                       (188.83 µs … 294.33 µs) 285.00 µs ▃██▆▄▃█▅▅▇▄█▂▄█▄▂▆██▂
                     gc(427.25 µs … 884.46 µs)   0.00  b (  0.00  b…  0.00  b)

utf8Slice + JSON.parse          275.18 µs/iter 275.88 µs     ▆█▆              
                       (260.92 µs … 316.46 µs) 307.00 µs ▁▂▄████▅▄▂▂▂▂▁▁▂▂▂▂▁▁
                     gc(554.54 µs … 969.92 µs)   0.00  b (  0.00  b…  0.00  b)

latin1Slice + JSON.parse        252.00 µs/iter 254.38 µs       ▃▄██▅▄         
                       (239.38 µs … 295.67 µs) 267.25 µs ▂▂▂▂▃▆██████▇▄▃▂▂▂▂▂▁
                     gc(569.21 µs …   1.30 ms)   0.00  b (  0.00  b…  0.00  b)

shaped positional (monomorphic) 186.74 µs/iter 192.88 µs   ▄█                 
                       (178.71 µs … 212.71 µs) 206.71 µs ▂▆███▄▂▂▂▁▁▃▃▅▄▂▂▁▁▁▁
                     gc(479.29 µs … 950.38 µs)   0.00  b (  0.00  b…  0.00  b)

summary
  shaped positional (monomorphic)
   1.26x faster than readString(utf8) + JSON.parse
   1.35x faster than latin1Slice + JSON.parse
   1.47x faster than utf8Slice + JSON.parse

• string-heavy · 5 text fields (utf8) · 1 rows
---------------------------------------------- -------------------------------
readString(utf8) + JSON.parse   264.74 ns/iter 267.91 ns   █▃▃                
                       (254.96 ns … 308.99 ns) 287.91 ns ▄█████▅▃▃▁▂▃▃▅▄▄▃▂▂▁▁
                     gc(511.88 µs …   3.28 ms)   0.31  b (  0.00  b…180.00  b)

utf8Slice + JSON.parse          253.58 ns/iter 258.51 ns    ▂▂      ▄█▅       
                       (239.01 ns … 284.91 ns) 269.36 ns ▂▄▅██▆▆▅▃▅█████▇▅▂▃▂▁
                     gc(488.29 µs … 993.00 µs)   0.00  b (  0.00  b…  0.00  b)

shaped positional (monomorphic) 290.02 ns/iter 295.51 ns  ██                  
                       (269.91 ns … 467.22 ns) 440.40 ns ▂███▆▂▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁
                     gc(619.67 µs …   7.03 ms)   0.18  b (  0.00  b… 76.00  b)

summary
  utf8Slice + JSON.parse
   1.04x faster than readString(utf8) + JSON.parse
   1.14x faster than shaped positional (monomorphic)

• string-heavy · 5 text fields (utf8) · 100 rows
---------------------------------------------- -------------------------------
readString(utf8) + JSON.parse    30.18 µs/iter  30.80 µs            █        █
                         (28.72 µs … 34.50 µs)  30.94 µs ███▁▁██▁▁▁▁█▁█▁▁▁▁▁██
                     gc(  6.81 ms …   8.52 ms)   1.80 kb (  0.00  b… 21.54 kb)

utf8Slice + JSON.parse           28.27 µs/iter  28.24 µs         ██           
                         (27.91 µs … 29.16 µs)  28.47 µs █▁▁▁▁▁▁██████▁▁█▁▁▁▁█
                     gc(  6.76 ms …   7.20 ms)   0.33  b (  0.00  b…  4.00  b)

shaped positional (monomorphic)  24.67 µs/iter  24.78 µs  █    █              
                         (24.16 µs … 25.75 µs)  25.42 µs ███▁█▁█▁█▁█▁▁▁█▁▁▁▁▁█
                     gc( 17.16 ms …  18.29 ms)   1.18 kb (  0.00  b… 14.10 kb)

summary
  shaped positional (monomorphic)
   1.15x faster than utf8Slice + JSON.parse
   1.22x faster than readString(utf8) + JSON.parse

• string-heavy · 5 text fields (utf8) · 1000 rows
---------------------------------------------- -------------------------------
readString(utf8) + JSON.parse   389.88 µs/iter 424.75 µs            █    ▄    
                       (326.33 µs … 490.00 µs) 455.21 µs ▂▄█▇▇▅▄▇▅▂▆██▄▁▇██▂▂▁
                     gc(444.46 µs …   1.16 ms)   0.00  b (  0.00  b…  0.00  b)

utf8Slice + JSON.parse          430.02 µs/iter 433.04 µs    ▂█▇█▃             
                       (413.54 µs … 515.88 µs) 466.54 µs ▁▃▅█████▇▇▃▃▃▂▂▁▂▁▁▁▁
                     gc(563.04 µs … 935.58 µs)   0.00  b (  0.00  b…  0.00  b)

shaped positional (monomorphic) 343.55 µs/iter 351.17 µs          ▄▆██▆       
                       (308.75 µs … 689.08 µs) 374.50 µs ▂▄▇▆▆▅▃▄▆█████▇▇▄▅▃▂▁
                     gc(550.38 µs …   4.31 ms)   0.00  b (  0.00  b…  0.00  b)

summary
  shaped positional (monomorphic)
   1.13x faster than readString(utf8) + JSON.parse
   1.25x faster than utf8Slice + JSON.parse

! = run with sudo to enable hardware counters
