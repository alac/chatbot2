import hashlib
import re
import os
import sys

# Get the directory where THIS script is located
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

SW_PATH = os.path.join(BASE_DIR, 'sw.js')

# Core files that should always be cached
CORE_FILES = ['index.html', 'manifest.json']
# Directories to recursively search and cache
DIRECTORIES_TO_HASH = ['js', 'css'] # Add 'img' or 'assets' here if needed later

def get_files_and_hash():
    """Generates a combined MD5 hash and a list of web paths for caching."""
    hasher = hashlib.md5()
    
    files_to_hash = []       # Absolute paths used for reading/hashing
    web_paths_to_cache = []  # Formatted paths for the sw.js array

    # 1. Always include the root directory in the cache list
    web_paths_to_cache.append('./')

    # 2. Add core files
    for core_file in CORE_FILES:
        abs_path = os.path.join(BASE_DIR, core_file)
        if os.path.exists(abs_path):
            files_to_hash.append(abs_path)
            web_paths_to_cache.append(f'./{core_file}')
        else:
            print(f"Warning: Could not find core file {core_file}")

    # 3. Recursively find all files in the specified directories
    for dir_name in DIRECTORIES_TO_HASH:
        dir_path = os.path.join(BASE_DIR, dir_name)
        if not os.path.exists(dir_path):
            print(f"Warning: Directory {dir_path} does not exist. Skipping.")
            continue
            
        for root, dirs, files in os.walk(dir_path):
            dirs.sort()
            files.sort()
            
            for file in files:
                # Ignore hidden files (like .DS_Store)
                if not file.startswith('.'): 
                    abs_path = os.path.join(root, file)
                    files_to_hash.append(abs_path)
                    
                    # Create the relative web path (e.g., ./js/main.js)
                    rel_path = os.path.relpath(abs_path, BASE_DIR)
                    # Ensure forward slashes for the web, even if run on Windows
                    web_path = './' + rel_path.replace('\\', '/')
                    web_paths_to_cache.append(web_path)

    # 4. Hash all collected files
    if not files_to_hash:
        print("Error: No files found to hash.")
        sys.exit(1)

    for filepath in files_to_hash:
        with open(filepath, 'rb') as f:
            hasher.update(f.read())
            
    return hasher.hexdigest()[:8], web_paths_to_cache

def update_service_worker():
    print("Scanning files and calculating hash...")
    file_hash, web_paths = get_files_and_hash()
    
    if not os.path.exists(SW_PATH):
        print(f"Error: Could not find {SW_PATH}")
        sys.exit(1)
    
    with open(SW_PATH, 'r', encoding='utf-8') as f:
        content = f.read()

    # --- UPDATE 1: Update the Cache Name ---
    new_content = re.sub(
        r"const cacheName = '.*?';", 
        f"const cacheName = 'chtbt2-{file_hash}';", 
        content
    )

    # --- UPDATE 2: Update the filesToCache Array ---
    # Format the python list into a neat JavaScript array string
    js_array_items = ",\n    ".join([f"'{path}'" for path in web_paths])
    new_array_string = f"const filesToCache = [\n    {js_array_items}\n];"
    
    # re.DOTALL allows the .*? regex to match across multiple lines
    new_content = re.sub(
        r"const filesToCache = \[.*?\];", 
        new_array_string, 
        new_content,
        flags=re.DOTALL
    )

    # Check if anything actually changed to avoid unnecessary writes
    if content == new_content:
        print(f"No changes detected. Hash remains: {file_hash}")
        return

    # Write the changes back to sw.js
    with open(SW_PATH, 'w', encoding='utf-8') as f:
        f.write(new_content)
    
    print(f"Successfully updated sw.js hash to: {file_hash}")
    print(f"Added {len(web_paths)} files to the cache list.")

if __name__ == "__main__":
    update_service_worker()