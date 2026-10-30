from PIL import Image

def convert_png_to_ico(input_png_path, output_ico_path="favicon.ico"):
    img = Image.open(input_png_path)
    
    # Standard multi-resolution sizes for Windows / browser tab favicons
    icon_sizes = [(16, 16), (32, 32), (48, 48), (64, 64)]
    
    # Save as .ico containing all standard sizes
    img.save(output_ico_path, format="ICO", sizes=icon_sizes)
    print(f"Successfully created {output_ico_path} with sizes: {icon_sizes}")

if __name__ == "__main__":
    import sys
    # Usage: python make_ico.py [path_to_512.png]
    input_file = sys.argv[1] if len(sys.argv) > 1 else "icon-512.png"
    convert_png_to_ico(input_file)