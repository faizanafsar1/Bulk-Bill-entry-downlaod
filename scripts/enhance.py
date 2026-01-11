import cv2
import sys
import numpy as np

input_path = sys.argv[1]
output_path = sys.argv[2]

img = cv2.imread(input_path)
if img is None:
    raise Exception("Image not found")

# Convert to grayscale (OCR usually better on grayscale)
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

# Sharpening kernel (unsharp mask)
kernel = np.array([
    [-1, -1, -1],
    [-1,  9, -1],
    [-1, -1, -1]
])

sharpened = cv2.filter2D(gray, -1, kernel)

# Optional: slight Gaussian blur to reduce noise without losing sharpness
# sharpened = cv2.GaussianBlur(sharpened, (3, 3), 0)

# Save the result
cv2.imwrite(output_path, sharpened)
