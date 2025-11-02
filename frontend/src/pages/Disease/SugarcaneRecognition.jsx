import React, { useState } from "react";
import axios from "axios";

const SugarcaneRecognition = () => {
  const [selectedImage, setSelectedImage] = useState(null);
  const [result, setResult] = useState({
    prediction: "",
    description: "",
    symptoms: "",
    recommendation: "",
  });
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const handleImageChange = (e) => {
    setSelectedImage(e.target.files[0]);
    setResult({
      prediction: "",
      description: "",
      symptoms: "",
      recommendation: "",
    });
  };

  const handlePredict = async () => {
    if (!selectedImage) {
      alert("Please upload an image first.");
      return;
    }

    const formData = new FormData();
    formData.append("image", selectedImage);

    setLoading(true);
    try {
      // Use same-origin during dev; fall back to VITE_BACKEND_BASE_URL in prod
      const isDev = import.meta.env && import.meta.env.DEV;
      const envBase = (import.meta.env.VITE_BACKEND_BASE_URL || '').trim();
      const base = isDev ? window.location.origin : (/^https?:\/\//i.test(envBase) && envBase.length > 0 ? envBase : window.location.origin);
      const url = `${String(base).replace(/\/+$/, '')}/api/sugarcane`;
      const response = await axios.post(
        url,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );
      const res = response.data;
      setResult({
        prediction: res.prediction,
        description: res.details.description,
        symptoms: res.details.symptoms,
        recommendation: res.details.recommended_action,
      });
      setErrorMsg("");
    } catch (error) {
      const msg = error?.response?.data?.error || error?.message || 'Prediction failed';
      console.error("Error predicting disease:", msg);
      setErrorMsg(String(msg));
      setResult({ prediction: "", description: "", symptoms: "", recommendation: "" });
    }
    setLoading(false);
    console.log(result);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-200 to-green-400 p-4 mt-10">
      <div className="bg-white bg-opacity-90 rounded-lg shadow-lg p-8 w-full max-w-md text-center mt-5">
        <h2 className="text-2xl font-bold text-green-700 mb-4">
          Sugarcane Disease Recognition
        </h2>
        <p className="mb-6 text-gray-700">
          Upload an image of your sugarcane plant to identify potential diseases.
        </p>

        <div className="mb-6">
          <input
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            className="block w-full text-sm text-gray-500
                       file:mr-4 file:py-2 file:px-4
                       file:rounded-full file:border-0
                       file:text-sm file:font-semibold
                       file:bg-green-500 file:text-white
                       hover:file:bg-green-600 transition
                       cursor-pointer"
          />
        </div>

        {selectedImage && (
          <div className="mb-6">
            <img
              src={URL.createObjectURL(selectedImage)}
              alt="Uploaded"
              className="mx-auto rounded-md shadow-md max-w-xs"
            />
          </div>
        )}

        <button
          onClick={handlePredict}
          disabled={loading}
          className={`w-full py-3 px-4 rounded-md text-white font-semibold
                      ${
                        loading
                          ? "bg-gray-400 cursor-not-allowed"
                          : "bg-green-500 hover:bg-green-600"
                      }
                      transition duration-300`}
        >
          {loading ? "Predicting..." : "Predict"}
        </button>

        <div
          className={`mt-6 p-4 border border-green-500 rounded-md bg-green-50 bg-gradient-to-br from-green-100 to-green-400 
                      transition-all duration-300 ease-in-out 
                      ${result.prediction ? 'opacity-100 max-h-screen' : 'opacity-0 max-h-0 overflow-hidden'}
                      `}
        >
            <h3 className="text-2xl font-semibold text-white rounded-md bg-green-600 mb-2 text-center">
              Prediction
            </h3>
            <p className="text-xl text-black text-center font-bold m-auto w-fit p-1">
              {result.prediction}
            </p>
            <h3 className="text-xl font-semibold text-green-800 mb-1 mt-2 text-center underline">
              Description
            </h3>
            <p className="text-gray-800 text-center font-medium">
              {result.description}
            </p>

            <h3 className="text-xl font-semibold text-green-800 mb-1 mt-2 text-center underline">
              Symptoms
            </h3>
            <p className="text-gray-800 text-center font-medium">
              {result.symptoms}
            </p>

            <h3 className="text-xl font-semibold text-green-800 mb-1  mt-2 text-center underline">
              Recommendation
            </h3>
            <p className="text-gray-800 text-center font-medium">
              {result.recommendation}
            </p>
          </div>
          {!result.prediction && errorMsg && (
            <div className="mt-4 p-3 rounded-md bg-red-50 border border-red-300 text-red-700 text-sm break-words">
              {errorMsg}
            </div>
          )}
        
      </div>
    </div>
  );
};

export default SugarcaneRecognition;

