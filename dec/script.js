var KDF_ITERATIONS = 600000;
    var LEGACY_ITERATIONS = [200000];
    var SALT_SIZE = 16;
    var TAG_SIZE = 32;

    function b64urlDecode(text) {
      var cleaned = String(text).replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
      var pad = "=".repeat((4 - (cleaned.length % 4)) % 4);
      var bin = atob(cleaned + pad);
      var out = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }

    function b64urlEncode(bytes) {
      var bin = "";
      for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_");
    }

    async function deriveKeys(password, salt, iterations) {
      var base = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        "PBKDF2",
        false,
        ["deriveBits"]
      );
      var bits = await crypto.subtle.deriveBits(
        { name: "PBKDF2", salt: salt, iterations: iterations, hash: "SHA-256" },
        base,
        512
      );
      var material = new Uint8Array(bits);
      return { encKey: material.slice(0, 32), macKey: material.slice(32, 64) };
    }

    async function hmacImport(raw) {
      return crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    }

    async function hmacSign(key, data) {
      return new Uint8Array(await crypto.subtle.sign("HMAC", key, data));
    }

    async function keystream(encKey, length) {
      var key = await hmacImport(encKey);
      var out = new Uint8Array(length);
      var counter = 0;
      var offset = 0;
      while (offset < length) {
        var block = new Uint8Array(8);
        new DataView(block.buffer).setBigUint64(0, BigInt(counter));
        var digest = await hmacSign(key, block);
        var take = Math.min(32, length - offset);
        out.set(digest.subarray(0, take), offset);
        offset += take;
        counter += 1;
      }
      return out;
    }

    function xorBytes(data, stream) {
      var out = new Uint8Array(data.length);
      for (var i = 0; i < data.length; i++) out[i] = data[i] ^ stream[i];
      return out;
    }

    function constantTimeEqual(a, b) {
      if (a.length !== b.length) return false;
      var diff = 0;
      for (var i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
      return diff === 0;
    }

    async function encryptText(plaintext, password) {
      var salt = crypto.getRandomValues(new Uint8Array(SALT_SIZE));
      var keys = await deriveKeys(password, salt, KDF_ITERATIONS);
      var data = new TextEncoder().encode(plaintext);
      var ciphertext = xorBytes(data, await keystream(keys.encKey, data.length));
      var macKey = await hmacImport(keys.macKey);
      var signed = new Uint8Array(salt.length + ciphertext.length);
      signed.set(salt, 0);
      signed.set(ciphertext, salt.length);
      var tag = await hmacSign(macKey, signed);
      var raw = new Uint8Array(signed.length + tag.length);
      raw.set(signed, 0);
      raw.set(tag, signed.length);
      return { token: b64urlEncode(raw), iterations: KDF_ITERATIONS };
    }

    async function decryptText(token, password) {
      var raw;
      try {
        raw = b64urlDecode(token);
      } catch (error) {
        throw new Error("Invalid ciphertext encoding.");
      }
      if (raw.length < SALT_SIZE + TAG_SIZE) throw new Error("Ciphertext is too short.");
      var salt = raw.slice(0, SALT_SIZE);
      var signed = raw.slice(0, raw.length - TAG_SIZE);
      var ciphertext = raw.slice(SALT_SIZE, raw.length - TAG_SIZE);
      var tag = raw.slice(raw.length - TAG_SIZE);
      var attempts = [KDF_ITERATIONS].concat(LEGACY_ITERATIONS);
      for (var i = 0; i < attempts.length; i++) {
        var iterations = attempts[i];
        var keys = await deriveKeys(password, salt, iterations);
        var macKey = await hmacImport(keys.macKey);
        var expected = await hmacSign(macKey, signed);
        if (!constantTimeEqual(expected, tag)) continue;
        var plain = xorBytes(ciphertext, await keystream(keys.encKey, ciphertext.length));
        try {
          return { plaintext: new TextDecoder("utf-8", { fatal: true }).decode(plain), iterations: iterations };
        } catch (error) {
          throw new Error("Invalid ciphertext or password.");
        }
      }
      throw new Error("Invalid ciphertext or password.");
    }

    var STORAGE_KEY = "encrize.cryptobot.password";
    var MIN_PASSWORD_LENGTH = 4;
    var MAX_PASSWORD_LENGTH = 128;
    var MAX_PLAINTEXT_LENGTH = 3000;

    function el(id) { return document.getElementById(id); }

    function setStatus(node, message, kind) {
      if (!node) return;
      node.textContent = message;
      node.className = "note" + (kind ? " " + kind : "");
    }

    function storedPassword() {
      try { return localStorage.getItem(STORAGE_KEY); } catch (error) { return null; }
    }

    function refreshPasswordStatus() {
      var saved = storedPassword();
      if (saved) {
        setStatus(el("passwordStatus"), "Password saved in this browser (" + saved.length + " characters). Use show to reveal it.", "ok");
      } else {
        setStatus(el("passwordStatus"), "No password saved yet.", null);
      }
    }

    function currentPassword() {
      var typed = el("passwordField").value;
      return typed ? typed : storedPassword() || "";
    }

    el("toggle").addEventListener("click", function () {
      var field = el("passwordField");
      var hidden = field.type === "password";
      field.type = hidden ? "text" : "password";
      this.textContent = hidden ? "hide" : "show";
    });

    el("save").addEventListener("click", function () {
      var value = el("passwordField").value.trim();
      if (value.length < MIN_PASSWORD_LENGTH || value.length > MAX_PASSWORD_LENGTH) {
        setStatus(el("passwordStatus"), "Invalid length. Use " + MIN_PASSWORD_LENGTH + " to " + MAX_PASSWORD_LENGTH + " characters.", "err");
        return;
      }
      try {
        localStorage.setItem(STORAGE_KEY, value);
      } catch (error) {
        setStatus(el("passwordStatus"), "Storage error. The password was not saved.", "err");
        return;
      }
      el("passwordField").value = value;
      setStatus(el("passwordStatus"), "Password saved. It will be used for decrypting and encrypting.", "ok");
    });

    el("forget").addEventListener("click", function () {
      try { localStorage.removeItem(STORAGE_KEY); } catch (error) {}
      el("passwordField").value = "";
      setStatus(el("passwordStatus"), "Password removed from this browser.", null);
    });

    async function runDecrypt() {
      var status = el("decryptStatus");
      var password = currentPassword();
      var token = el("tokenInput").value.trim();
      el("plainOut").textContent = "";
      if (!password) { setStatus(status, "No password is set. Save one above first.", "err"); return; }
      if (!token) { setStatus(status, "Paste an encrypted message first.", "err"); return; }
      setStatus(status, "Deriving the key (" + KDF_ITERATIONS + " iterations), one moment...", null);
      el("decryptBtn").disabled = true;
      try {
        var result = await decryptText(token, password);
        el("plainOut").textContent = result.plaintext;
        setStatus(
          status,
          "Decrypted. " + result.plaintext.length + " characters, " + result.iterations + " iterations" +
            (result.iterations === KDF_ITERATIONS ? "." : " (legacy message)."),
          "ok"
        );
      } catch (error) {
        setStatus(status, error && error.message ? error.message : "Decryption failed.", "err");
      } finally {
        el("decryptBtn").disabled = false;
      }
    }

    async function runEncrypt() {
      var status = el("encryptStatus");
      var password = currentPassword();
      var text = el("plainInput").value;
      el("tokenOut").textContent = "";
      if (!password) { setStatus(status, "No password is set. Save one above first.", "err"); return; }
      if (!text.trim()) { setStatus(status, "Type some text first.", "err"); return; }
      if (text.length > MAX_PLAINTEXT_LENGTH) {
        setStatus(status, "Message is too long. The limit is " + MAX_PLAINTEXT_LENGTH + " characters.", "err");
        return;
      }
      setStatus(status, "Deriving the key (" + KDF_ITERATIONS + " iterations), one moment...", null);
      el("encryptBtn").disabled = true;
      try {
        var encrypted = await encryptText(text, password);
        el("tokenOut").textContent = encrypted.token;
        setStatus(status, "Encrypted with " + encrypted.iterations + " iterations. The bot needs the same iteration count to read it.", "ok");
      } catch (error) {
        setStatus(status, "Encryption failed. Try again.", "err");
      } finally {
        el("encryptBtn").disabled = false;
      }
    }

    async function copyFrom(nodeId, statusId) {
      var value = el(nodeId).textContent;
      if (!value) { setStatus(el(statusId), "Nothing to copy yet.", "err"); return; }
      try {
        await navigator.clipboard.writeText(value);
        setStatus(el(statusId), "Copied to clipboard.", "ok");
      } catch (error) {
        setStatus(el(statusId), "Clipboard blocked. Select the text and copy manually.", "err");
      }
    }

    el("decryptBtn").addEventListener("click", runDecrypt);
    el("encryptBtn").addEventListener("click", runEncrypt);
    el("copyPlain").addEventListener("click", function () { copyFrom("plainOut", "decryptStatus"); });
    el("copyToken").addEventListener("click", function () { copyFrom("tokenOut", "encryptStatus"); });
    el("clearDecrypt").addEventListener("click", function () {
      el("tokenInput").value = ""; el("plainOut").textContent = ""; setStatus(el("decryptStatus"), "", null);
    });
    el("clearEncrypt").addEventListener("click", function () {
      el("plainInput").value = ""; el("tokenOut").textContent = "";
      setStatus(el("encryptStatus"), "The result can be decrypted by the bot with the same password and iteration count.", null);
    });
    el("passwordField").value = storedPassword() || "";
    refreshPasswordStatus();
