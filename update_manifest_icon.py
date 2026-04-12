import json
import base64
import os
import struct

def get_png_dims(file_path):
    """Reads the PNG header to get width and height without external libraries."""
    with open(file_path, 'rb') as f:
        data = f.read(24)
        if data[:8] != b'\x89PNG\r\n\x1a\n':
            return "192x192" # Default fallback
        w, h = struct.unpack('>LL', data[16:24])
        return f"{w}x{h}"

def update_manifest():
    icon_path = 'icon.png'
    manifest_path = 'manifest.json'

    # 1. Check if files exist
    if not os.path.exists(icon_path):
        print(f"Error: {icon_path} not found.")
        return
    if not os.path.exists(manifest_path):
        print(f"Error: {manifest_path} not found.")
        return

    # 2. Convert Image to Base64
    print(f"Reading {icon_path}...")
    with open(icon_path, "rb") as image_file:
        encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
    
    img_dims = get_png_dims(icon_path)
    data_uri = f"data:image/png;base64,{encoded_string}"

    # 3. Load and Update JSON
    print(f"Updating {manifest_path}...")
    with open(manifest_path, 'r') as f:
        manifest = json.load(f)

    icon_entry = {
        "src": data_uri,
        "type": "image/png",
        "sizes": img_dims,
        "purpose": "any maskable" # Recommended for modern PWAs
    }

    # Replace the icons list with our new single icon
    # (Or you can .append() if you want to keep multiple)
    manifest['icons'] = [icon_entry]

    # 4. Save the file
    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=2)

    print(f"Success! Manifest updated with a {img_dims} icon.")

if __name__ == "__main__":
    update_manifest()
    # Pause so you can see the result if you "double-click" on Windows
    input("\nPress Enter to close...")