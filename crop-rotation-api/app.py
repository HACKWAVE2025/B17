from flask import Flask, request, jsonify
import pandas as pd
import joblib
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# Load the crop recommendation model
try:
    crop_model = joblib.load('crop_rotation_recommendation_model.pkl')
except Exception as e:
    crop_model = None
    print(f"[crop-rotation-api] Warning: failed to load model: {e}")

# Define mappings directly in the Flask code
previous_crop_mapping = {
    'Groundnut': 1,
    'Millets': 2,
    'Wheat': 3,
    'Maize': 4,
    'Cotton': 5,
    'Sorghum': 6,
    'Barley': 7
}

soil_type_mapping = {
    'Loamy': 1,
    'Clayey': 2,
    'Sandy': 3,
    'Saline': 4,
}

crop_mapping = {
    1: 'Wheat',
    2: 'Rice',
    3: 'Millets',
    4: 'Cotton',
    5: 'Groundnut',
    6: 'Maize',
    7: 'Sorghum',
    8: 'Barley',
}

@app.route('/crop_recommendation', methods=['POST'])
def crop_recommendation():
    try:
        if crop_model is None:
            return jsonify({'error': 'Model not loaded. Ensure crop_rotation_recommendation_model.pkl exists.'}), 500
        # Get data from the POST request
        data = request.json
        print("Received data:", data)  # Debugging: Log received data

        # Extract features from the data
        previous_crop = data.get('Previous Crop')
        soil_type = data.get('Soil Type')
        moisture_level = data.get('Moisture Level')
        nitrogen = data.get('Nitrogen (N)')
        phosphorus = data.get('Phosphorus (P)')
        potassium = data.get('Potassium (K)')

        # Prepare data for prediction
        input_data = pd.DataFrame([{
            "Previous Crop": previous_crop_mapping.get(previous_crop, -1),  # Map to integer
            "Soil Type": soil_type_mapping.get(soil_type, -1),  # Map to integer
            "Moisture Level": moisture_level,
            "Nitrogen (N)": nitrogen,
            "Phosphorus (P)": phosphorus,
            "Potassium (K)": potassium
        }])

        # Make prediction
        prediction = crop_model.predict(input_data)
        print("Prediction:", prediction)

        if prediction[0] in crop_mapping:
            recommended_crop = crop_mapping[prediction[0]]
        else:
            return jsonify({'Recommended Crop': 'No prediction available'})

        return jsonify({'Recommended Crop': str(recommended_crop)})

    except Exception as e:
        return jsonify({'error': str(e)})

if __name__ == '__main__':
    import os
    port = int(os.getenv('PORT', 5005))
    host = os.getenv('HOST', '127.0.0.1')
    app.run(debug=True, host=host, port=port)
