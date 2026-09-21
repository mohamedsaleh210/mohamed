/**
 * Compresses photos in the browser before they are uploaded.
 *
 * A phone photo of an A4 page is routinely 4–6 MB. Sending ten of those over a
 * weak connection is the difference between an upload that finishes and one the
 * client gives up on. Resizing to 2000px and re-encoding as JPEG typically cuts
 * that by 80–90% while keeping small print readable.
 *
 * The server repeats this work regardless — this step is about the client's
 * time and data, not about trusting the browser.
 */
window.SanadCompress = (function () {
  'use strict';

  var MAX_EDGE = 2000;
  var QUALITY = 0.82;
  var SKIP_BELOW = 220 * 1024;

  var supported = (function () {
    try {
      var c = document.createElement('canvas');
      return !!(c.getContext && c.getContext('2d') && c.toBlob && window.FileReader);
    } catch (e) {
      return false;
    }
  })();

  function isHeic(file) {
    return /image\/(heic|heif)/i.test(file.type) || /\.(heic|heif)$/i.test(file.name || '');
  }

  function isImage(file) {
    return /^image\//i.test(file.type) || isHeic(file);
  }

  /**
   * Decodes with the EXIF orientation already applied where the browser
   * supports it. iPhone photos are usually stored sideways with a rotation
   * tag, and a plain canvas draw ignores that tag.
   */
  function decode(file) {
    if (window.createImageBitmap) {
      return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(function () {
        return decodeViaImg(file);
      });
    }
    return decodeViaImg(file);
  }

  function decodeViaImg(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('decode failed'));
      };
      img.src = url;
    });
  }

  function compressOne(file) {
    // HEIC cannot be decoded by canvas outside Safari, and a file that is
    // already small gains nothing. Both go to the server untouched, where
    // sharp handles them.
    if (!supported || !isImage(file) || isHeic(file)) return Promise.resolve(null);
    if (file.size <= SKIP_BELOW) return Promise.resolve(null);

    return decode(file)
      .then(function (bitmap) {
        var w = bitmap.width;
        var h = bitmap.height;
        var scale = Math.min(1, MAX_EDGE / Math.max(w, h));
        var tw = Math.round(w * scale);
        var th = Math.round(h * scale);

        var canvas = document.createElement('canvas');
        canvas.width = tw;
        canvas.height = th;

        var ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        // White behind the image so a transparent PNG does not turn black
        // once it becomes a JPEG.
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, tw, th);
        ctx.drawImage(bitmap, 0, 0, tw, th);

        if (bitmap.close) bitmap.close();

        return new Promise(function (resolve) {
          canvas.toBlob(
            function (blob) {
              canvas.width = canvas.height = 0; // free the backing store
              // Keep the original if the "compressed" version came out larger.
              if (!blob || blob.size >= file.size) return resolve(null);
              resolve(
                new File([blob], (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg', {
                  type: 'image/jpeg',
                  lastModified: Date.now(),
                })
              );
            },
            'image/jpeg',
            QUALITY
          );
        });
      })
      .catch(function () {
        return null; // never block an upload because compression failed
      });
  }

  /**
   * Compresses a list of files, reporting progress as it goes.
   * Resolves with the new list plus how much was saved.
   */
  function compressAll(files, onProgress) {
    var list = Array.prototype.slice.call(files || []);
    var out = [];
    var before = 0;
    var after = 0;
    var skipped = 0;

    return list
      .reduce(function (chain, file, i) {
        return chain.then(function () {
          if (onProgress) onProgress(i, list.length, file.name);
          before += file.size;

          return compressOne(file).then(function (compressed) {
            var final = compressed || file;
            if (!compressed) skipped += 1;
            after += final.size;
            out.push(final);
          });
        });
      }, Promise.resolve())
      .then(function () {
        if (onProgress) onProgress(list.length, list.length, null);
        return {
          files: out,
          before: before,
          after: after,
          saved: before - after,
          savedPercent: before ? Math.round(((before - after) / before) * 100) : 0,
          skipped: skipped,
        };
      });
  }

  function humanSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  return {
    supported: supported,
    compressAll: compressAll,
    compressOne: compressOne,
    humanSize: humanSize,
    isHeic: isHeic,
  };
})();
