import os
import numpy as np
import tensorflow as tf
from tensorflow.keras.models import load_model
from tensorflow.keras.preprocessing.image import load_img, img_to_array
from PIL import Image

# MODELS
models = []
MODEL_PRESENT = False

def _try_load(path):
    try:
        if os.path.exists(path):
            return load_model(path)
    except Exception:
        return None
    return None

# Attempt to load any available models independently
_candidates = [
    './models/model2_84percentacc.h5',
    './models/82_test_acc.h5',
    './models/mobilenet_model.keras',
    './models/inceptionv3_80.h5',
]
for p in _candidates:
    m = _try_load(p)
    if m is not None:
        models.append(m)

MODEL_PRESENT = len(models) > 0

# Optional demo mode: return random labels if models are absent
DEMO_MODE = str(os.getenv('SUGARCANE_DEMO_MODE', '')).strip() == '1'

# PREDICTION

def predict_sugarcane(filepath):
    # Function to predict the health of sugarcane based on the input image
    if not MODEL_PRESENT or not models:
        if DEMO_MODE:
            # Return a random class index [0..4] for demo purposes
            return int(np.random.randint(0, 5))
        # Use heuristic fallback when models are not available
        return heuristic_predict(filepath)
    # Preprocess once, then generate predictions from each model
    x = preprocess_image(filepath)
    preds = [m.predict(x) for m in models]
    preds_array = np.array(preds)  # Convert predictions list to a NumPy array
    avg_preds = np.mean(preds_array, axis=0)  # Calculate the average predictions
    # avg_preds is shape (1, num_classes); get scalar class index
    label_idx = int(np.argmax(avg_preds, axis=1)[0])
    return label_idx  # Return the predicted class index as an int


def heuristic_predict(image_path: str) -> int:
    """Heuristic fallback to produce a deterministic label when models are missing.

    Rules based on RGB channel means (image resized to 128x128):
    - Strong green dominance -> Healthy (0)
    - Yellowish (R and G high, B low) -> Yellow (4)
    - Strong red dominance -> RedRot (2)
    - Brownish (R > G > B) with moderate brightness -> Rust (3)
    - Else -> Mosaic (1)
    """
    try:
        with Image.open(image_path) as im:
            im = im.convert('RGB').resize((128, 128))
            arr = np.asarray(im, dtype=np.float32)
    except Exception:
        # If image read fails, default to Healthy
        return 0

    Rm = float(arr[:, :, 0].mean())
    Gm = float(arr[:, :, 1].mean())
    Bm = float(arr[:, :, 2].mean())
    brightness = (Rm + Gm + Bm) / 3.0

    # Healthy: green dominance
    if Gm - max(Rm, Bm) >= 20:
        return 0

    # Yellow: R and G high, B low
    if Rm > 120 and Gm > 120 and Bm < 100:
        return 4

    # RedRot: red dominance
    if Rm - max(Gm, Bm) >= 20:
        return 2

    # Rust: brownish, moderate brightness
    if Rm > Gm > Bm and 60 < brightness < 180:
        return 3

    # Mosaic: catch-all
    return 1

def preprocess_image(image_path, target_size=(224, 224)):
    # Function to preprocess the image before feeding it to the model
    # Load the image with the specified target size
    img = load_img(image_path, target_size=target_size)
    # Convert the image to a NumPy array
    img_array = img_to_array(img)
    # Reshape the image to match the model's input shape (add batch dimension)
    img_array = np.expand_dims(img_array, axis=0)
    # Rescale the pixel values to the range [0, 1]
    img_array /= 255.0
    return img_array  # Return the preprocessed image
