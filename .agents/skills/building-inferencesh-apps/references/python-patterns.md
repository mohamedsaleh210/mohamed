# Python: Debugging, Optimization & Cancellation

## Debugging Issues

### Import Errors — "ModuleNotFoundError" in Production

1. Add `__init__.py` files to all packages
2. Add current directory to Python path:
```python
import sys, os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
```
3. For local packages, use editable installs in requirements.txt:
```txt
-e ./local_package_directory
```

### CUDA Out of Memory

1. Reduce batch size
2. Use `torch.float16` or `bfloat16`
3. `model.gradient_checkpointing_enable()`
4. `torch.cuda.empty_cache()` after requests
5. Increase `vram` in inf.yml

### Memory Leaks

```python
import gc, torch

async def run(self, input_data):
    result = self.process(input_data)
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    gc.collect()
    return result
```

### Device Errors — "Expected all tensors to be on the same device"

```python
input_tensor = input_tensor.to(self.device)
```

### "CUDA not available"

1. Check `inf.yml` GPU requirements:
```yaml
resources:
  gpu:
    count: 1
    vram: 24
```
2. Use device detection:
```python
from accelerate import Accelerator
device = Accelerator().device
```

### Model Loading — "Token required for gated model"

Add HF_TOKEN to secrets:
```yaml
secrets:
  - key: HF_TOKEN
    description: HuggingFace token for gated models
```

### "File not found" After Download

Don't assume file paths:
```python
model_path = snapshot_download(repo_id="org/model")
config_path = os.path.join(model_path, "config.yaml")
if os.path.exists(config_path):
    # Load config
```

### Temporary Files Deleted Too Early

```python
with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp:
    output_path = tmp.name
```

### Path Separators

```python
path = os.path.join("models", "config", "settings.json")
```

### Version Conflicts

Pin compatible versions:
```txt
torch==2.6.0
numpy>=1.23.5,<2
```

### Debug Logging

```python
import logging
logging.basicConfig(level=logging.DEBUG)

async def setup(self, config):
    logging.debug(f"Config: {config}")
    logging.info("Starting model load...")
```

## GPU Apps — Tips

### Device Detection

**Never use `torch.cuda.is_available()`** — it doesn't reliably detect GPUs in grid containers. Always use accelerate:

```python
from accelerate import Accelerator

class App(BaseApp):
    async def setup(self, config):
        accelerator = Accelerator()
        self.device = accelerator.device
```

### Moving Models to GPU

**For large models (>1B params), use `device_map`** — it uses Accelerate's Big Model Inference to stream weights directly from disk to GPU via mmap, skipping CPU materialization entirely. This is dramatically faster than `from_pretrained` + `.to()`:

```python
# FAST — streams disk → GPU directly, skips CPU (use for large models)
from accelerate import Accelerator
device = Accelerator().device
self.model = AutoModel.from_pretrained("org/model", dtype=torch.bfloat16, device_map=str(device))

# SLOW — loads to CPU first, then copies to GPU (fine for small models)
self.model = AutoModel.from_pretrained("org/model")
self.model = self.model.to(device=self.device, dtype=torch.float16)
```

**Why it matters:** Without `device_map`, PyTorch mmap's safetensors into CPU page cache, materializes every tensor, then copies to GPU via `.to()`. For a 27B model this takes ~2 minutes. With `device_map`, Accelerate creates a meta-device skeleton and streams each shard directly to GPU — same model loads in ~18 seconds (7x faster).

**Note:** `device_map` requires `accelerate` installed. For libraries that don't support `device_map` (custom model classes, some older libraries), fall back to `from_pretrained` + `.to()`.

**SentenceTransformer caveat:** SentenceTransformer defers `.to(device)` until the first `encode()` call, not during `__init__`. For small models this is fine. For large models, prefer the raw transformers path with `device_map`.

### Checklist for GPU Apps

- `accelerate` in `requirements.txt`
- `Accelerator().device` for device detection
- `device_map=str(device)` for large models (>1B params)
- Explicit `.to(device, dtype)` for small models or unsupported libraries
- `inf.yml` has `resources.gpu.count: 1` and appropriate `vram`

## Optimizing Performance

### Model Loading

Use HuggingFace hub for downloads:

```python
import os
from huggingface_hub import snapshot_download

os.environ["HF_HUB_ENABLE_HF_TRANSFER"] = "1"

class App(BaseApp):
    async def setup(self, config):
        self.model_path = snapshot_download(
            repo_id="org/model-name",
            resume_download=True,
        )
```

**Avoid**:
- Hardcoded local directories (`local_dir="./models"`)
- Subprocess calls to `huggingface-cli`
- Assuming specific file structures

### Memory Cleanup

```python
import torch, gc

def cleanup_memory():
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    gc.collect()

async def run(self, input_data):
    result = self.model(input_data)
    cleanup_memory()
    return result
```

### Mixed Precision

```python
model = model.to(dtype=torch.bfloat16)

# Or with autocast
from torch.amp import autocast
with autocast('cuda'):
    output = model(input)
```

### Flash Attention

```python
model = AutoModel.from_pretrained(
    "model-name",
    attn_implementation="flash_attention_2",
    torch_dtype=torch.bfloat16
)
```

### Error Handling

```python
import logging

async def run(self, input_data):
    try:
        result = self.process(input_data)
        return AppOutput(result=result)
    except Exception as e:
        logging.error(f"Processing failed: {e}")
        raise ValueError(f"Failed to process: {str(e)}")
```

### Pre-deploy Checklist

- [ ] All imports work
- [ ] `setup()` loads models
- [ ] `run()` processes test input
- [ ] No hardcoded paths/devices
- [ ] Memory cleaned up

## Handling Cancellation

### The on_cancel Hook

```python
class App(BaseApp):
    async def setup(self, config):
        self.cancel_flag = False

    async def on_cancel(self):
        """Called when user cancels the task"""
        print("Cancellation requested...")
        self.cancel_flag = True
        return True

    async def run(self, input_data):
        self.cancel_flag = False

        for i in range(100):
            if self.cancel_flag:
                print("Stopping work...")
                break

            await self.heavy_computation(i)
```

### Best Practices

1. **Check frequently**: In loops, check your cancellation flag at the start of every iteration.
2. **Clean up**: Close database connections, delete temporary files, or free GPU memory before exiting.
3. **Return quickly**: The `on_cancel` handler should be fast — just set a flag or signal an event.
4. **Force kill**: If an app does not respond to `on_cancel` within the timeout period (default 30s), it will be forcefully terminated (SIGKILL).
