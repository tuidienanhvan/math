//Including the dependencies
#include <Wire.h> 
#include <WiFi.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ThingSpeak.h>
#include <HTTPClient.h>
#include "base64.h"

//ThingSpeak Channel Credentials
const char* WIFI_NAME="Wokwi-GUEST";        
const char* WIFI_PASSWORD = "";               
const int myChannelNumber=2527670;            
const char* myApiKey="4GUFVO761V2M6QVY";
const char* server = "api.thingspeak.com";

#define SCREEN_WIDTH 128 // OLED display width, in pixels
#define SCREEN_HEIGHT 64 // OLED display height, in pixels

// Declaration for an SSD1306 display connected to I2C (SDA, SCL pins)
#define OLED_RESET -1 // Reset pin # (or -1 if sharing Arduino reset pin)
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);


#define RELAY 19          //Pin for Relay (To imitate the functioning of a fan)

#define PULSE_PIN 35      //Pin for the pulse sensor

#define alertLed 32       //Pin for the alterLed

WiFiClient client;

//Crenditals for Twilio (Messaging)
const char* accountSid = "AC574c8ac9da6d95d130a441fdaface639";  
const char* authToken = "0c406fcdada6b04db18ce894536ee0c6";
const char* fromPhoneNumber = "+17693009297";
const char* toPhoneNumber = "+918838080465";

int minHeartRate = 50;
int maxHeartRate = 120;

void setup() {
  Wire.begin();
  Wire.begin(16,17);
  Serial.begin(115200);
  
  pinMode(alertLed, OUTPUT);  //Declaration of PinMode
  pinMode(RELAY, OUTPUT);

  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println(F("SSD1306 allocation failed"));
    while(1);
  }

  // Clear the buffer
  display.clearDisplay();

  // Initialzing the OLED display
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0,30);
  display.println("Heart Rate Monitor");
  display.display();

  //Connecting with Wifi
  WiFi.begin(WIFI_NAME,WIFI_PASSWORD);
  while (WiFi.status()!=WL_CONNECTED){
    delay(1000);
    Serial.print("Wifi not connected...\n");
  }
  Serial.println("\nWifi connected");
  Serial.println("IP Address: "+String(WiFi.localIP()));
  WiFi.mode(WIFI_STA);
  ThingSpeak.begin(client);   //Connecting with ThingSpeak

  Serial.println("HIGH HEART RATES WILL BE DISPLAYED BELOW:");
}

void loop() {
  int statusCode=0;        //StatusCode for getting input from thingSpeak
  
  // Read pulseValue from PULSE_PIN 
  int16_t pulseValue = analogRead(PULSE_PIN);
  
  // Convert pulseValue to voltage
  float voltage = pulseValue * (5 / 4095.0);
  
  // calculate heartRate from voltage
  int heartRate = (voltage / 3.3) * 675;


  ThingSpeak.setField(1,heartRate);                //Exporting data to thingSpeak
  ThingSpeak.writeFields(myChannelNumber,myApiKey);

  String messageBody = "ALERT: Heart Rate is above threshold.";

  // Encode the Twilio credentials
  String credentials = String(accountSid) + ":" + String(authToken);
  String encodedCredentials = base64::encode(credentials);

  // Create the URL for the Twilio API
  String url = "https://api.twilio.com/2010-04-01/Accounts/" + String(accountSid) + "/Messages.json";

  // Create the POST data
  String postData = "To=" + String(toPhoneNumber) + "&From=" + String(fromPhoneNumber) + "&Body=" + messageBody;

  // Create and configure the HTTP client for Twilio
  HTTPClient http;
  http.begin(url);
  http.addHeader("Authorization", "Basic " + encodedCredentials);
  http.addHeader("Content-Type", "application/x-www-form-urlencoded");

  /* -> If the heartRate is above 120pm, an alert led with be initiated along with the speed of the fan going to a high simulated with a relay.
     -> If the heartRate is below 50bpm, the information along with low heartrate alert will be display in the OLED*/
  
  
  if (heartRate < minHeartRate){
   
    display.clearDisplay();
    display.setTextSize(1);      
    display.setTextColor(SSD1306_WHITE);  
    display.setCursor(0,0);
    display.print("Heart Rate is below");
    display.setCursor(0,15);
    display.print("Minimum Threshold");
    display.setCursor(20,30);
    display.print(String(heartRate)+" bpm");
    display.display();
    digitalWrite(RELAY, LOW);
    digitalWrite(alertLed, LOW);

  }
  else if (heartRate > maxHeartRate){
    
    display.clearDisplay();
    display.setTextSize(1);      
    display.setTextColor(SSD1306_WHITE);  
    display.setCursor(0,0);
    display.print("Heart Rate is above");
    display.setCursor(0,15);
    display.print("Maximum Threshold");
    display.setCursor(20,30);
    display.print(String(heartRate)+" bpm");
    display.setCursor(10,50);
    display.print("Speed set at Max");
    display.display();

    digitalWrite(alertLed, HIGH); // Turning on the LED

    digitalWrite(RELAY, HIGH);    //Turning on the relay(simulating a fan)
    
    
  }else{
    
    display.clearDisplay();
    display.setTextSize(1);      
    display.setTextColor(SSD1306_WHITE);  
    display.setCursor(0,0);
    display.print("Heart Rate is Normal");
    display.setCursor(20,40);
    display.print(String(heartRate)+" bpm");
    display.display();
    digitalWrite(RELAY, LOW);
    digitalWrite(alertLed, LOW);

  }

  
  if (heartRate > maxHeartRate){
    int httpCode = http.POST(postData);     //Sending the message once the heartRate is above the threshold.
    Serial.println("Heart Rate: "+String(heartRate));
    
    if (httpCode == HTTP_CODE_OK) {
      ;
  } 

  // Close the connection
  http.end();

  }



  delay(2000); 

}
