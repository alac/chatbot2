import hashlib
import re
import os
import sys

# Get the directory where THIS script is located
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# Adjust these to point to your files relative to the script location
INDEX_PATH = os.path.join(BASE_DIR, 'index.html')
SW_PATH = os.path.join(BASE_DIR, 'sw.js')

def get_file_hash(filepath):
    try:
        with open(filepath, 'rb') as f:
            return hashlib.md5(f.read()).hexdigest()[:8]
    except FileNotFoundError:
        return None

def update_service_worker():
    file_hash = get_file_hash(INDEX_PATH)
    if not file_hash:
        print(f"Error: Could not find {INDEX_PATH}")
        sys.exit(1)

    if not os.path.exists(SW_PATH):
        print(f"Error: Could not find {SW_PATH}")
        sys.exit(1)
    
    with open(SW_PATH, 'r', encoding='utf-8') as f:
        content = f.read()

    # Updates the CACHE_NAME line
    new_content = re.sub(
        r"const cacheName = '.*?';", 
        f"const cacheName = 'chtbt2-{file_hash}';", 
        content
    )

    with open(SW_PATH, 'w', encoding='utf-8') as f:
        f.write(new_content)
    
    with open(SW_PATH, 'r', encoding='utf-8') as f:
        content = f.read()
        print(content)
    print(f"Successfully updated sw.js hash to: {file_hash}")

if __name__ == "__main__":
    update_service_worker()