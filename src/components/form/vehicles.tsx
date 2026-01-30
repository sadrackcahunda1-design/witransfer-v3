/** @format */

"use client";

import React, { useState } from "react";
import { useForm } from "@/hooks/use-form";
import { useNotification } from "@/hooks/use-notification";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { saveCarAction } from "@/actions/private/cars/actions";
import { VehicleFormData } from "@/types";
import {
  Field,
  FieldLabel,
  FieldError,
} from "@/components/ui/field";
import {
  Car,
  Settings,
  Activity,
  FileText,
  CheckCircle,
  Check,
  Loader2,
  Image as ImageIcon
} from "lucide-react";
import { uploadVehicleImage } from "@/lib/storage";

interface VehicleRegistrationFormProps {
  vehicleId?: string;
  onSuccess?: () => void;
  isEdit?: boolean;
  initialData?: VehicleFormData;
  // New props for pre-fetched data
  partners?: any[];
  categories?: any[];
  features?: any[];
  services?: any[];
  currentUser?: any;
}

const VehicleRegistrationForm: React.FC<VehicleRegistrationFormProps> = ({
  vehicleId,
  onSuccess,
  isEdit = false,
  initialData: providedData,
  partners = [],
  categories = [],
  features = [],
  services: allServices = [],
  currentUser = null
}) => {
  const { sucesso, erro } = useNotification();
  const [uploadingImage, setUploadingImage] = useState(false);

  const defaultData: VehicleFormData = {
    // A) Dados Básicos
    brand: "",
    model: "",
    year: new Date().getFullYear(),
    color: "",
    category: "",
    licensePlate: "",
    status: "ativa",
    partnerId: (!["ADMIN", "SUPER_ADMIN", "GERENCIADOR"].includes(currentUser?.role) && currentUser?.partnerId) ? currentUser.partnerId : "",
    image: "",
    services: [],
    extras: [],

    // B) Informações Técnicas
    vin: "",
    engineNumber: "",
    fuelType: "gasolina",
    transmission: "manual",
    potency: "",
    displacement: "",

    // C) Estado e Condições
    mileage: 0,
    condition: "novo",
    conditionLevel: "otimo",
    lastService: "",
    nextService: "",

    // D) Documentação
    insuranceCompany: "",
    insurancePolicy: "",
    insuranceExpiry: "",
    inspectionLast: "",
    inspectionExpiry: "",

    // Extras
    seats: 5,
    hasAC: true,
    hasABS: false,
    hasAirbags: false,
    hasLSD: false,
    hasEB: false,
    luggageCapacity: 0,
    smallLuggageCapacity: 0,
    doors: 4,
  };



  const { values, errors, isSubmitting, handleChange, setError, handleSubmit } = useForm({
    initialValues: { ...defaultData, ...(providedData || {}) },
    onSubmit: async (data) => {
      // Validações com feedback melhorado
      const missingFields: string[] = [];
      const fieldErrors: Record<string, string> = {};

      if (!data.brand) { 
        fieldErrors.brand = "Marca é obrigatória";
        missingFields.push("Marca"); 
      }
      if (!data.model) { 
        fieldErrors.model = "Modelo é obrigatório";
        missingFields.push("Modelo"); 
      }
      if (!data.licensePlate) { 
        fieldErrors.licensePlate = "Matrícula é obrigatória";
        missingFields.push("Matrícula"); 
      }
      if (!data.category) { 
        fieldErrors.category = "Categoria é obrigatória";
        missingFields.push("Categoria"); 
      }

      // Se há erros, aplicar todos e mostrar uma mensagem clara
      if (missingFields.length > 0) {
        Object.entries(fieldErrors).forEach(([field, message]) => {
          setError(field, message);
        });
        erro(`${missingFields.length} campo(s) obrigatório(s) não preenchido(s): ${missingFields.join(", ")}`);
        return;
      }

      try {
        const cleanData: any = {
          brand: data.brand,
          model: data.model,
          licensePlate: data.licensePlate,
          year: data.year,
          color: data.color,
          category: data.category,
          services: data.services,
          status: data.status,
          partnerId: data.partnerId,
          image: data.image,
          image_url: data.image,
          vin: data.vin,
          engineNumber: data.engineNumber,
          fuelType: data.fuelType,
          transmission: data.transmission,
          potency: data.potency,
          displacement: data.displacement,
          mileage: data.mileage,
          condition: data.condition,
          conditionLevel: data.conditionLevel,
          lastService: data.lastService,
          nextService: data.nextService,
          insuranceCompany: data.insuranceCompany,
          insurancePolicy: data.insurancePolicy,
          insuranceExpiry: data.insuranceExpiry,
          inspectionLast: data.inspectionLast,
          inspectionExpiry: data.inspectionExpiry,
          seats: data.seats,
          doors: data.doors,
          luggageCapacity: data.luggageCapacity,
          smallLuggageCapacity: data.smallLuggageCapacity,
          hasAC: data.hasAC,
          hasABS: data.hasABS,
          hasAirbags: data.hasAirbags,
          hasLSD: data.hasLSD,
          hasEB: data.hasEB,
          memberId: data.memberId,
          extras: data.extras,
        };

        const result = await saveCarAction({
          ...cleanData,
          id: isEdit ? vehicleId : undefined
        });

        if (result.success) {
          sucesso(isEdit ? "Veículo atualizado com sucesso!" : "Veículo cadastrado com sucesso!");
          onSuccess?.();
        } else {
          // Mensagem real de erro do servidor
          const errorMsg = result.error || "Falha ao salvar o veículo. Tente novamente.";
          console.error("[VehicleForm] Save error:", result);
          erro(errorMsg);
        }
      } catch (err: any) {
        console.error("[VehicleForm] Submit error:", err);
        const errorMsg = err?.message || "Erro ao processar a requisição. Verifique sua conexão.";
        erro(errorMsg);
      }
    },
  });

  const handleImageUpload = async (file: File | null) => {
    if (!file) return;

    // Validação básica no cliente
    const maxSizeKB = 5120; // 5MB
    const fileSizeKB = file.size / 1024;
    if (fileSizeKB > maxSizeKB) {
      erro(`Imagem muito grande (${Math.round(fileSizeKB)}KB). Máximo: ${maxSizeKB}KB`);
      return;
    }

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      erro("Apenas JPG, PNG ou WEBP são aceitos");
      return;
    }

    setUploadingImage(true);
    try {
      const result = await uploadVehicleImage(file);
      if (result.success && result.data) {
        handleChange("image", result.data.url);
        sucesso("Imagem do veículo carregada com sucesso!");
      } else {
        // Erro com mensagem real do servidor
        erro(result.error || "Falha ao carregar imagem. Tente novamente.");
      }
    } catch (error: any) {
      console.error("[VehicleForm] Upload error:", error);
      erro("Erro inesperado durante upload. Verifique sua conexão.");
    } finally {
      setUploadingImage(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-10 bg-white p-8 md:p-12 rounded-none shadow-sm border border-slate-100">
      {/* Header Info */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-6">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">
            {isEdit ? "Editar Veículo" : "Registar Novo Veículo"}
          </h2>
          <p className="text-sm text-slate-500 font-medium mt-1">
            Preencha os detalhes técnicos e legais do veículo.
          </p>
        </div>
        <div className={`px-4 py-2 rounded-none text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ${isEdit ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"}`}>
          <div className={`w-2 h-2 rounded-full animate-pulse ${isEdit ? "bg-amber-500" : "bg-emerald-500"}`} />
          {isEdit ? "Modo Edição" : "Modo Criação"}
        </div>
      </div>

      {/* Form Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-10">

        {/* SECTION A: BASIC DATA */}
        <div className="space-y-6">
          <div className="flex items-center gap-2 text-primary font-bold mb-4">
            <Car size={20} />
            <span className="tracking-wider text-xs">Dados Básicos</span>
          </div>

          {/* IMAGE UPLOAD FIELD */}
          <div className="col-span-2">
            <FieldLabel>Imagem do Veículo</FieldLabel>
            <div className="mt-2 border-2 border-dashed border-gray-200 rounded-xl p-6 hover:border-primary/50 transition-colors bg-white">
              <div className="flex flex-col items-center justify-center gap-4 text-center">
                {values.image ? (
                  <div className="relative w-full h-48 rounded-none overflow-hidden bg-white shadow-sm">
                    <img src={values.image} alt="Preview" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                      <label className="cursor-pointer bg-white text-black px-4 py-2 rounded-none font-bold text-sm hover:scale-105 transition-transform">
                        Mudar Foto
                        <input type="file" className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e.target.files?.[0] || null)} />
                      </label>
                    </div>
                  </div>
                ) : (
                  <label className="cursor-pointer flex flex-col items-center gap-2 w-full h-full justify-center py-8">
                    {uploadingImage ? (
                      <Loader2 className="w-10 h-10 text-primary animate-spin" />
                    ) : (
                      <ImageIcon className="w-10 h-10 text-gray-300" />
                    )}
                    <span className="text-sm font-medium text-gray-600">
                      {uploadingImage ? "A carregar..." : "Clique para adicionar uma foto"}
                    </span>
                    <span className="text-xs text-gray-400">JPG, PNG ou WEBP (Máx 5MB)</span>
                    <input type="file" className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e.target.files?.[0] || null)} disabled={uploadingImage} />
                  </label>
                )}
              </div>
            </div>
          </div>


          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel>Marca <span className="text-red-500 ml-1">*</span></FieldLabel>
              <Input
                value={values.brand}
                onChange={(e) => handleChange("brand", e.target.value)}
                placeholder="Ex: Toyota"
                className="rounded-none border-gray-200 bg-white"
              />
              <FieldError>{errors.brand}</FieldError>
            </Field>

            <Field>
              <FieldLabel>Modelo <span className="text-red-500 ml-1">*</span></FieldLabel>
              <Input
                value={values.model}
                onChange={(e) => handleChange("model", e.target.value)}
                placeholder="Ex: Land Cruiser"
                className="rounded-none border-gray-200 bg-white"
              />
              <FieldError>{errors.model}</FieldError>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel>Matrícula <span className="text-red-500 ml-1">*</span></FieldLabel>
              <Input
                value={values.licensePlate}
                onChange={(e) => handleChange("licensePlate", e.target.value)}
                placeholder="LD-00-00-AA"
                className="font-mono rounded-none border-gray-200 bg-white"
              />
              <FieldError>{errors.licensePlate}</FieldError>
            </Field>

            <Field>
              <FieldLabel>Ano</FieldLabel>
              <Input
                type="number"
                value={values.year}
                onChange={(e) => handleChange("year", e.target.value === "" ? 0 : parseInt(e.target.value))}
                className="rounded-none border-gray-200 bg-white"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel>Cor</FieldLabel>
              <Input
                value={values.color}
                onChange={(e) => handleChange("color", e.target.value)}
                placeholder="Branco"
                className="rounded-none border-gray-200 bg-white"
              />
            </Field>

            <Field>
              <FieldLabel>Categoria</FieldLabel>
              <Select
                value={values.category}
                onValueChange={(val) => handleChange("category", val)}
              >
                <SelectTrigger className="rounded-none border-gray-200 bg-white">
                  <SelectValue placeholder="Selecionar" />
                </SelectTrigger>
                <SelectContent className="rounded-none border-gray-100">
                  {categories.length > 0 ? (
                    categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))
                  ) : (
                    <div className="p-2 text-xs text-slate-400 text-center font-medium">
                      Nenhuma categoria disponível.<br />Crie uma categoria primeiro.
                    </div>
                  )}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {["ADMIN", "SUPER_ADMIN", "GERENCIADOR"].includes(currentUser?.role) && (
            <Field>
              <FieldLabel>Parceiro / Empresa</FieldLabel>
              <Select
                value={values.partnerId}
                onValueChange={(v) => handleChange("partnerId", v)}
              >
                <SelectTrigger className="rounded-none border-gray-200 bg-white">
                  <SelectValue placeholder="Selecionar parceiro" />
                </SelectTrigger>
                <SelectContent className="rounded-none">
                  {partners.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}

          {/* SECTION: ADMISSIBLE SERVICES */}
          <div className="space-y-4 pt-4 border-t border-slate-100">
            <div className="flex items-center gap-2 text-primary font-bold">
              <Activity size={18} />
              <span className="tracking-wider text-[10px]">Capacidades de Serviço</span>
            </div>
            <p className="text-[10px] text-slate-400 font-bold tracking-tight ml-1">Selecione os tipos de serviços que este veículo está autorizado a realizar.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-5 bg-white rounded-none border border-slate-200">
              {allServices.length > 0 ? (
                allServices.map((service) => {
                  const isChecked = values.services?.includes(service.id);
                  return (
                    <label key={service.id} className="flex items-center gap-3 cursor-pointer group p-2 hover:bg-slate-50 rounded-none transition-all border border-transparent hover:border-slate-100">
                      <div className={`w-6 h-6 rounded-none border-2 flex items-center justify-center transition-all ${isChecked ? "bg-emerald-500 border-emerald-500 shadow-sm shadow-emerald-200" : "bg-white border-slate-200 group-hover:border-emerald-400"}`}>
                        {isChecked && <Check size={14} className="text-white stroke-[3px]" />}
                        <input
                          type="checkbox"
                          className="hidden"
                          checked={isChecked}
                          onChange={(e) => {
                            const currentServices = values.services || [];
                            if (e.target.checked) {
                              handleChange("services", [...currentServices, service.id]);
                            } else {
                              handleChange("services", currentServices.filter(id => id !== service.id));
                            }
                          }}
                        />
                      </div>
                      <div className="flex flex-col">
                        <span className={`text-sm font-bold ${isChecked ? "text-slate-900" : "text-slate-500"}`}>{service.name}</span>
                        {service.billingType && <span className="text-[9px] text-slate-400 font-bold tracking-tighter">{service.billingType === 'per_km' ? 'Base Distância' : 'Base Tempo'}</span>}
                      </div>
                    </label>
                  );
                })
              ) : (
                <div className="col-span-2 flex items-center justify-center py-4 gap-2 text-slate-400">
                  <span className="text-xs font-bold tracking-widest leading-none">Sem serviços disponíveis.</span>
                </div>
              )}
            </div>
          </div>
        </div>


        {/* SECTION B: TECHNICAL SPECIFICATIONS */}
        <div className="space-y-6">
          <div className="flex items-center gap-2 text-primary font-bold mb-4">
            <Settings size={20} />
            <span className="tracking-wider text-xs">Especificações Técnicas</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel>Combustível</FieldLabel>
              <Select
                value={values.fuelType}
                onValueChange={(val) => handleChange("fuelType", val)}
              >
                <SelectTrigger className="rounded-none border-gray-200 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-none">
                  <SelectItem value="gasolina">Gasolina</SelectItem>
                  <SelectItem value="diesel">Diesel</SelectItem>
                  <SelectItem value="hibrido">Híbrido</SelectItem>
                  <SelectItem value="eletrico">Elétrico</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel>Transmissão</FieldLabel>
              <Select
                value={values.transmission}
                onValueChange={(val) => handleChange("transmission", val)}
              >
                <SelectTrigger className="rounded-none border-gray-200 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-none">
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="automatico">Automática</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field>
            <FieldLabel>VIN (Número do Chassi)</FieldLabel>
            <Input
              value={values.vin}
              onChange={(e) => handleChange("vin", e.target.value)}
              placeholder="17 caracteres"
              className="font-mono rounded-none border-gray-200 bg-white"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel>Potência (HP/cv)</FieldLabel>
              <Input
                value={values.potency}
                onChange={(e) => handleChange("potency", e.target.value)}
                placeholder="Ex: 150cv"
                className="rounded-none border-gray-200 bg-white"
              />
            </Field>
            <Field>
              <FieldLabel>Cilindrada (cc/L)</FieldLabel>
              <Input
                value={values.displacement}
                onChange={(e) => handleChange("displacement", e.target.value)}
                placeholder="Ex: 2.0L"
                className="rounded-none border-gray-200 bg-white"
              />
            </Field>
          </div>
        </div>

        {/* SECTION C: CONDITION & PERFORMANCE */}
        <div className="space-y-6">
          <div className="flex items-center gap-2 text-primary font-bold mb-4">
            <Activity size={20} />
            <span className="tracking-wider text-xs">Condição & Desempenho</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel>Quilometragem Atual (km)</FieldLabel>
              <Input
                type="number"
                value={values.mileage}
                onChange={(e) => handleChange("mileage", e.target.value === "" ? 0 : parseInt(e.target.value))}
                className="rounded-none border-gray-200 bg-white font-bold"
              />
            </Field>

            <Field>
              <FieldLabel>Assentos</FieldLabel>
              <Input
                type="number"
                value={values.seats}
                onChange={(e) => handleChange("seats", e.target.value === "" ? 0 : parseInt(e.target.value))}
                className="rounded-none border-gray-200 bg-white font-bold"
              />
            </Field>

            <Field>
              <FieldLabel>Número de Portas</FieldLabel>
              <Input
                type="number"
                value={values.doors}
                onChange={(e) => handleChange("doors", e.target.value === "" ? 0 : parseInt(e.target.value))}
                className="rounded-none border-gray-200 bg-white font-bold"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel>Bagagem Grande</FieldLabel>
              <Input
                type="number"
                value={values.luggageCapacity}
                onChange={(e) => handleChange("luggageCapacity", e.target.value === "" ? 0 : parseInt(e.target.value))}
                className="rounded-none border-gray-200 bg-white font-bold"
                placeholder="Ex: 2"
              />
            </Field>

            <Field>
              <FieldLabel>Bagagem Pequena</FieldLabel>
              <Input
                type="number"
                value={values.smallLuggageCapacity}
                onChange={(e) => handleChange("smallLuggageCapacity", e.target.value === "" ? 0 : parseInt(e.target.value))}
                className="rounded-none border-gray-200 bg-white font-bold"
                placeholder="Ex: 1"
              />
            </Field>
          </div>

          <div className="flex flex-wrap gap-4 p-4 bg-white rounded-none border border-gray-200">
            {features.length > 0 ? (
              features.map((feature) => {
                const isChecked = (values.extras || []).includes(feature.id);

                return (
                  <label key={feature.id} className="flex items-center gap-3 cursor-pointer group p-2 hover:bg-slate-50 transition-colors rounded-none border border-transparent hover:border-slate-100">
                    <div className={`w-5 h-5 rounded-none border flex items-center justify-center transition-all ${isChecked ? "bg-primary border-primary" : "bg-white border-gray-300 group-hover:border-primary"}`}>
                      {isChecked && <Check size={14} className="text-white" />}
                      <input
                        type="checkbox"
                        className="hidden"
                        checked={isChecked}
                        onChange={(e) => {
                          const currentExtras = values.extras || [];
                          const targetId = feature.id; // Ensure stable reference
                          let newExtras;
                          if (e.target.checked) {
                            newExtras = [...currentExtras, targetId];
                          } else {
                            newExtras = currentExtras.filter((id: string) => id !== targetId);
                          }
                          handleChange("extras", newExtras);
                        }}
                      />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-700">{feature.name}</span>
                      <span className="text-[10px] text-slate-400">{feature.type === 'service_extra' ? 'EXTRA/SERVIÇO' : 'CARACTERÍSTICA'}</span>
                    </div>
                  </label>
                );
              })
            ) : (
              <p className="text-xs text-slate-400 font-bold tracking-widest leading-none">Nenhum extra encontrado.</p>
            )}
          </div>
        </div>

        {/* SECTION D: DOCUMENTATION */}
        <div className="space-y-6">
          <div className="flex items-center gap-2 text-primary font-bold mb-4">
            <FileText size={20} />
            <span className="tracking-wider text-xs">Documentação & Validade</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel>Seguradora</FieldLabel>
              <Input
                value={values.insuranceCompany}
                onChange={(e) => handleChange("insuranceCompany", e.target.value)}
                placeholder="Ex: ENSA, Fidelidade"
                className="rounded-none border-gray-200 bg-white"
              />
            </Field>
            <Field>
              <FieldLabel>Número da Apólice</FieldLabel>
              <Input
                value={values.insurancePolicy}
                onChange={(e) => handleChange("insurancePolicy", e.target.value)}
                placeholder="Ex: POL-123456"
                className="rounded-none border-gray-200 bg-white"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel>Próxima Revisão</FieldLabel>
              <Input
                type="date"
                value={values.nextService}
                onChange={(e) => handleChange("nextService", e.target.value)}
                className="rounded-none border-gray-200 bg-white"
              />
            </Field>

            <Field>
              <FieldLabel>Validade da Inspeção</FieldLabel>
              <Input
                type="date"
                value={values.inspectionExpiry}
                onChange={(e) => handleChange("inspectionExpiry", e.target.value)}
                className="rounded-none border-gray-200 bg-white"
              />
            </Field>
          </div>
        </div>

      </div>

      {/* Footer Actions */}
      <div className="pt-8 border-t border-slate-100 flex items-center justify-end gap-4">
        <Button
          type="button"
          variant="outline"
          className="rounded-none h-12 px-8 font-bold border-slate-200 hover:bg-slate-50 text-slate-500 text-xs tracking-widest"
          onClick={() => window.history.back()}
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting || uploadingImage}
          className="rounded-none h-12 px-10 font-black bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/25 disabled:opacity-50 transition-all flex items-center gap-2 text-xs tracking-widest"
          title={uploadingImage ? "Aguarde o upload da imagem..." : ""}
        >
          {isSubmitting || uploadingImage ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>{uploadingImage ? "Carregando..." : "Processando..."}</span>
            </>
          ) : (
            <>
              <CheckCircle size={20} />
              <span>{isEdit ? "Salvar Alterações" : "Registar Veículo"}</span>
            </>
          )}
        </Button>
      </div>
    </form>
  );
};

export default VehicleRegistrationForm;
