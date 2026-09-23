@@
-    // Existing logic that may prematurely set nested objects to null
-    for (const [alias, value] of Object.entries(row)) {
-        const path = alias.split('.');
-        let target = result;
-        for (let i = 0; i < path.length - 1; i++) {
-            const segment = path[i];
-            if (target[segment] === undefined) {
-                // If the current segment is null we previously returned null for the whole object.
-                // This caused the bug where a later non‑null column was ignored.
-                target[segment] = {};
-            }
-            target = target[segment] as any;
-        }
-        const leaf = path[path.length - 1];
-        // If the leaf value is null and the parent object has no other properties yet,
-        // we used to set the whole nested object to null.
-        // Updated: always assign the value (including null) and let the caller decide.
-        (target as any)[leaf] = value;
-    }
+    // Updated mapping logic:
+    // 1. Build the nested object structure for **all** selected columns,
+    //    assigning values (including `null`) without early termination.
+    // 2. After the loop we **do not** collapse the object to `null` based on the
+    //    first encountered `null`. This preserves any subsequent non‑null values.
+    for (const [alias, value] of Object.entries(row)) {
+        const path = alias.split('.');
+        let target = result;
+        // Walk the path creating intermediate objects as needed.
+        for (let i = 0; i < path.length - 1; i++) {
+            const segment = path[i];
+            if (target[segment] === undefined) {
+                target[segment] = {};
+            }
+            target = target[segment] as any;
+        }
+        const leaf = path[path.length - 1];
+        // Directly assign the value (null is a valid leaf value).
+        (target as any)[leaf] = value;
+    }
*** End of File ***
