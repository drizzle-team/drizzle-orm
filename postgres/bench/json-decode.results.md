clk: ~4.29 GHz
cpu: Apple M4
runtime: bun 1.3.14 (arm64-darwin)

benchmark                   avg (min … max) p75 / p99    (min … top 1%)
------------------------------------------- -------------------------------
• object · 1 row
------------------------------------------- -------------------------------
JSON.parse [lossy]           206.00 ns/iter 207.29 ns   ▃▇▇█▅              
                    (199.54 ns … 261.27 ns) 223.74 ns ▁▄██████▆▃▃▂▂▁▁▁▁▁▁▁▁
                  gc(299.25 µs …   2.39 ms)   1.43  b (  0.00  b…328.00  b)

JSON.parse + reviver         827.02 ns/iter 827.38 ns  ▇█                  
                      (797.83 ns … 1.38 µs) 959.76 ns ▃███▇▃▃▂▂▁▁▁▁▁▁▁▁▁▁▁▁
                  gc(374.29 µs …   2.94 ms)   0.12  b (  0.00  b… 28.00  b)

parseJsonBuffer              962.81 ns/iter 972.65 ns     ▂█▆▆▄▃           
                      (926.64 ns … 1.03 µs)   1.03 µs ▂▄▇█████████▅▄▂▂▂▃▂▁▁
                  gc(583.83 µs …   1.03 ms)   2.53  b (  0.00  b…512.00  b)

Shape scanner                416.39 ns/iter 417.53 ns  ▂█▄                 
                    (397.32 ns … 839.50 ns) 494.64 ns ▂████▅▄▃▂▁▁▁▁▁▁▁▁▁▁▁▁
                  gc(407.46 µs …   2.22 ms)   2.46  b (  0.00  b…416.00  b)

summary
  JSON.parse [lossy]
   2.02x faster than Shape scanner
   4.01x faster than JSON.parse + reviver
   4.67x faster than parseJsonBuffer

• object · 50 rows
------------------------------------------- -------------------------------
JSON.parse [lossy]             9.88 µs/iter   9.91 µs       █  ▄ ▄   ▄     
                       (9.76 µs … 10.08 µs)  10.03 µs █▅▅█▁█████▁█▅▁▁█▁▁▅▁█
                  gc(  1.54 ms …   2.13 ms) 199.29  b (  0.00  b…  6.56 kb)

JSON.parse + reviver          40.58 µs/iter  40.64 µs █              █    █
                      (40.23 µs … 41.62 µs)  40.77 µs ██▁▁▁██▁█▁▁▁█▁▁█▁▁▁▁█
                  gc(  1.80 ms …   2.00 ms)   0.99 kb (  0.00  b… 11.72 kb)

parseJsonBuffer               49.60 µs/iter  49.56 µs         █            
                      (49.19 µs … 50.47 µs)  50.07 µs ▅▅▁▁▁▅█▁█▁▁▁▅▁▁▁▁▁▁▁▅
                  gc(  9.49 ms …   9.90 ms) 772.00  b (  0.00  b…  8.80 kb)

Shape scanner                 19.45 µs/iter  19.51 µs          ██  █       
                      (19.24 µs … 19.79 µs)  19.56 µs █▁▁▁█▁▁▁███▁▁█▁▁▁██▁█
                  gc(  7.66 ms …   8.21 ms) 203.76  b (  0.00  b…  3.38 kb)

summary
  JSON.parse [lossy]
   1.97x faster than Shape scanner
   4.11x faster than JSON.parse + reviver
   5.02x faster than parseJsonBuffer

• object · 150 rows
------------------------------------------- -------------------------------
JSON.parse [lossy]            29.22 µs/iter  29.41 µs              █       
                      (28.76 µs … 29.61 µs)  29.50 µs █▁█▁▁▁▁█▁█▁█▁█▁█▁▁███
                  gc(  4.02 ms …   4.42 ms)  23.64  b (  0.00  b…168.00  b)

JSON.parse + reviver         128.03 µs/iter 129.71 µs  ▂█▆▆▆▂              
                    (121.08 µs … 220.67 µs) 147.21 µs ▂███████▅▄▄▃▂▂▂▂▁▁▁▁▁
                  gc(281.83 µs …   1.02 ms)   0.00  b (  0.00  b…  0.00  b)

parseJsonBuffer              146.09 µs/iter 147.83 µs    ▇▇█▅▄             
                    (139.42 µs … 204.21 µs) 160.88 µs ▂▅███████▆▆▄▃▃▂▂▁▁▁▁▁
                  gc(299.38 µs …   1.72 ms)   9.62  b (  0.00  b… 16.00 kb)

Shape scanner                 61.37 µs/iter  61.45 µs ███ █  █   █ █ ██  ██
                      (59.91 µs … 66.98 µs)  61.86 µs ███▁█▁▁█▁▁▁█▁█▁██▁▁██
                  gc( 15.20 ms …  16.15 ms)   1.05 kb (  0.00  b… 12.54 kb)

summary
  JSON.parse [lossy]
   2.1x faster than Shape scanner
   4.38x faster than JSON.parse + reviver
   5x faster than parseJsonBuffer

• array · 1 row
------------------------------------------- -------------------------------
JSON.parse [lossy]             1.05 µs/iter   1.05 µs  █                   
                      (988.90 ns … 1.75 µs)   1.68 µs ███▂▂▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁
                  gc(375.83 µs …   2.15 ms)   0.14  b (  0.00  b… 16.00  b)

JSON.parse + reviver           4.01 µs/iter   4.02 µs   █▅                 
                        (3.91 µs … 4.43 µs)   4.36 µs ▄████▆▄▂▄▁▄▁▁▁▂▁▁▂▁▁▂
                  gc(644.25 µs …   2.00 ms)   0.00  b (  0.00  b…  0.00  b)

parseJsonBuffer                3.38 µs/iter   3.41 µs   █▇▃ ▇              
                        (3.29 µs … 3.67 µs)   3.64 µs ▃▅███▇█▆█▅▃▁▂▁▂▂▁▁▁▁▂
                  gc(  1.41 ms …   2.30 ms)   0.14  b (  0.00  b…  8.00  b)

Shape scanner                  1.87 µs/iter   1.89 µs     ▃█▂▂             
                        (1.81 µs … 2.52 µs)   1.97 µs ▂▇▇██████▇▆█▆▂▆▄▁▂▁▂▂
                  gc(926.17 µs …   4.18 ms)   0.61  b (  0.00  b… 76.00  b)

summary
  JSON.parse [lossy]
   1.78x faster than Shape scanner
   3.21x faster than parseJsonBuffer
   3.81x faster than JSON.parse + reviver

• array · 50 rows
------------------------------------------- -------------------------------
JSON.parse [lossy]            50.36 µs/iter  50.56 µs              █       
                      (49.60 µs … 51.84 µs)  50.72 µs █▁▁▁▁███▁█▁▁▁██▁▁█▁██
                  gc(955.13 µs …   1.32 ms)  21.33  b (  0.00  b…148.00  b)

JSON.parse + reviver         216.84 µs/iter 222.75 µs   ▅█▅                
                    (201.21 µs … 280.04 µs) 254.58 µs ▂██████▆▅▅▅▄▃▃▃▃▂▂▂▁▁
                  gc(335.17 µs … 948.33 µs)   0.00  b (  0.00  b…  0.00  b)

parseJsonBuffer              177.93 µs/iter 179.58 µs  ▃█▆                 
                    (166.54 µs … 340.08 µs) 222.29 µs ▃███▇▅▄▂▃▂▂▂▂▁▁▁▁▁▁▁▁
                  gc(298.33 µs …   1.24 ms)   0.00  b (  0.00  b…  0.00  b)

Shape scanner                 94.89 µs/iter  96.58 µs   ▇█▅█▇▄             
                     (89.38 µs … 130.17 µs) 107.04 µs ▂█████████▇▅▄▄▂▂▂▂▁▂▁
                  gc(300.71 µs … 758.96 µs)   0.00  b (  0.00  b…  0.00  b)

summary
  JSON.parse [lossy]
   1.88x faster than Shape scanner
   3.53x faster than parseJsonBuffer
   4.31x faster than JSON.parse + reviver

• array · 150 rows
------------------------------------------- -------------------------------
JSON.parse [lossy]           153.55 µs/iter 155.17 µs   ▃▆▃█▅              
                    (145.83 µs … 233.71 µs) 171.38 µs ▁▃██████▇▄▄▄▃▃▂▂▁▁▁▁▁
                  gc(295.88 µs …   1.09 ms)   0.00  b (  0.00  b…  0.00  b)

JSON.parse + reviver         606.21 µs/iter 608.46 µs  ▂█▆                 
                      (582.33 µs … 1.44 ms) 693.67 µs ▂████▆▅▃▃▂▂▁▁▁▁▁▁▁▁▁▁
                  gc(318.42 µs …   1.58 ms)   0.00  b (  0.00  b…  0.00  b)

parseJsonBuffer              506.03 µs/iter 508.50 µs   ▇█▄                
                      (485.38 µs … 1.19 ms) 579.67 µs ▁▅████▆▄▃▂▁▁▁▁▁▁▁▁▁▁▁
                  gc(331.96 µs …   3.11 ms)   0.00  b (  0.00  b…  0.00  b)

Shape scanner                278.68 µs/iter 282.92 µs    ▄▆█▆▄             
                    (260.08 µs … 431.79 µs) 321.79 µs ▁▃▆██████▆▅▃▂▂▂▁▁▁▁▁▁
                  gc(322.17 µs …   1.22 ms)   0.00  b (  0.00  b…  0.00  b)

summary
  JSON.parse [lossy]
   1.81x faster than Shape scanner
   3.3x faster than parseJsonBuffer
   3.95x faster than JSON.parse + reviver

! = run with sudo to enable hardware counters
