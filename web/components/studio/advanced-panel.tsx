'use client';

import * as React from 'react';
import type { AdvancedSettings } from '@/lib/studio/settings';
import {
  ANGLES,
  APERTURES,
  ASPECT_RATIOS,
  COLLAGE_LAYOUTS,
  CROPS,
  DEPTHS,
  FRAMINGS,
  GRADES,
  GRAIN,
  LENSES,
  LIGHTING,
  MAX_VARIANTS,
  QUALITIES,
  RETOUCH,
  SEPARATION,
  SPACING,
  TEMPERATURES,
  TIMES,
  optionLabel,
} from '@/lib/studio/settings';
import { Field, Input, Textarea } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator, Slider, Switch } from '@/components/ui/controls';
import { PanelTitle } from '@/components/ui/card';

type Patch = (updater: (current: AdvancedSettings) => AdvancedSettings) => void;

function OptionSelect<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
  help,
}: {
  id: string;
  label: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
  help?: string;
}) {
  return (
    <Field label={label} htmlFor={id} help={help}>
      <Select value={value} onValueChange={(next) => onChange(next as T)}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {optionLabel(option)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function FidelitySlider({
  id,
  label,
  value,
  onChange,
  help,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  help?: string;
}) {
  return (
    <Field label={label} htmlFor={id} labelAside={value} help={help}>
      <Slider
        id={id}
        min={0}
        max={100}
        step={1}
        value={[value]}
        onValueChange={([next]) => onChange(next)}
        aria-label={label}
      />
    </Field>
  );
}

export function AdvancedPanel({
  settings,
  patch,
  poseIsUpload,
}: {
  settings: AdvancedSettings;
  patch: Patch;
  /** Collage splitting only applies to an uploaded contact sheet. */
  poseIsUpload: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      {/* --------------------------------------------------------- fidelity */}
      <section>
        <PanelTitle>Fidelity</PanelTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <FidelitySlider
            id="identity-fidelity"
            label="Identity"
            value={settings.identityFidelity}
            onChange={(v) => patch((c) => ({ ...c, identityFidelity: v }))}
            help="How strictly the face must match the reference."
          />
          <FidelitySlider
            id="pose-fidelity"
            label="Pose"
            value={settings.poseFidelity}
            onChange={(v) => patch((c) => ({ ...c, poseFidelity: v }))}
            help="Lower values allow more natural anatomy."
          />
          <FidelitySlider
            id="age-fidelity"
            label="Age"
            value={settings.ageFidelity}
            onChange={(v) => patch((c) => ({ ...c, ageFidelity: v }))}
          />
          <FidelitySlider
            id="hair-fidelity"
            label="Hair"
            value={settings.hairFidelity}
            onChange={(v) => patch((c) => ({ ...c, hairFidelity: v }))}
          />
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <label className="flex items-center justify-between gap-3 text-[12px]">
            <span>
              <span className="font-semibold">Preserve skin texture</span>
              <span className="block text-[10px] text-[var(--pf-text-tertiary)]">
                Avoids the plastic, over-smoothed look.
              </span>
            </span>
            <Switch
              checked={settings.preserveSkinTexture}
              onCheckedChange={(v) => patch((c) => ({ ...c, preserveSkinTexture: v }))}
              aria-label="Preserve skin texture"
            />
          </label>

          <label className="flex items-center justify-between gap-3 text-[12px]">
            <span>
              <span className="font-semibold">Emphasise hands and eyes</span>
              <span className="block text-[10px] text-[var(--pf-text-tertiary)]">
                Asks the engine to pay extra attention to common failure points.
              </span>
            </span>
            <Switch
              checked={settings.correctHands}
              onCheckedChange={(v) => patch((c) => ({ ...c, correctHands: v }))}
              aria-label="Emphasise hands and eyes"
            />
          </label>
        </div>
      </section>

      <Separator />

      {/* -------------------------------------------- per-person direction */}
      <section>
        <PanelTitle>Per-person direction</PanelTitle>
        <div className="flex flex-col gap-4">
          {settings.subjects.map((subject, index) => (
            <div key={index} className="grid gap-3 sm:grid-cols-[1.6fr_1fr]">
              <Field label={`Person ${index + 1} direction`} htmlFor={`subject-${index}-direction`}>
                <Input
                  id={`subject-${index}-direction`}
                  value={subject.direction}
                  maxLength={280}
                  placeholder="Navy blazer, standing left, hands in pockets"
                  onChange={(event) =>
                    patch((c) => ({
                      ...c,
                      subjects: c.subjects.map((s, i) =>
                        i === index ? { ...s, direction: event.target.value } : s,
                      ),
                    }))
                  }
                />
              </Field>
              <Field label="Expression" htmlFor={`subject-${index}-expression`}>
                <Input
                  id={`subject-${index}-expression`}
                  value={subject.expression}
                  maxLength={100}
                  placeholder="Warm half-smile"
                  onChange={(event) =>
                    patch((c) => ({
                      ...c,
                      subjects: c.subjects.map((s, i) =>
                        i === index ? { ...s, expression: event.target.value } : s,
                      ),
                    }))
                  }
                />
              </Field>
            </div>
          ))}
        </div>
      </section>

      <Separator />

      {/* ----------------------------------------------------------- camera */}
      <section>
        <PanelTitle>Camera</PanelTitle>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <OptionSelect
            id="framing"
            label="Framing"
            value={settings.camera.framing}
            options={FRAMINGS}
            onChange={(v) => patch((c) => ({ ...c, camera: { ...c.camera, framing: v } }))}
          />
          <OptionSelect
            id="angle"
            label="Angle"
            value={settings.camera.angle}
            options={ANGLES}
            onChange={(v) => patch((c) => ({ ...c, camera: { ...c.camera, angle: v } }))}
          />
          <OptionSelect
            id="lens"
            label="Lens"
            value={settings.camera.lens}
            options={LENSES}
            onChange={(v) => patch((c) => ({ ...c, camera: { ...c.camera, lens: v } }))}
          />
          <OptionSelect
            id="depth"
            label="Depth of field"
            value={settings.camera.depthOfField}
            options={DEPTHS}
            onChange={(v) => patch((c) => ({ ...c, camera: { ...c.camera, depthOfField: v } }))}
          />
          <OptionSelect
            id="aperture"
            label="Aperture"
            value={settings.camera.aperture}
            options={APERTURES}
            onChange={(v) => patch((c) => ({ ...c, camera: { ...c.camera, aperture: v } }))}
          />
        </div>
      </section>

      <Separator />

      {/* --------------------------------------------------------- lighting */}
      <section>
        <PanelTitle>Light and scene</PanelTitle>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <OptionSelect
            id="lighting"
            label="Lighting"
            value={settings.lighting}
            options={LIGHTING}
            onChange={(v) => patch((c) => ({ ...c, lighting: v }))}
          />
          <OptionSelect
            id="temperature"
            label="Colour temperature"
            value={settings.lightingTemperature}
            options={TEMPERATURES}
            onChange={(v) => patch((c) => ({ ...c, lightingTemperature: v }))}
          />
          <OptionSelect
            id="time"
            label="Time of day"
            value={settings.timeOfDay}
            options={TIMES}
            onChange={(v) => patch((c) => ({ ...c, timeOfDay: v }))}
          />
        </div>
      </section>

      <Separator />

      {/* ------------------------------------------------------ composition */}
      <section>
        <PanelTitle>Composition</PanelTitle>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <OptionSelect
            id="spacing"
            label="Subject spacing"
            value={settings.composition.spacing}
            options={SPACING}
            onChange={(v) => patch((c) => ({ ...c, composition: { ...c.composition, spacing: v } }))}
          />
          <OptionSelect
            id="crop"
            label="Crop"
            value={settings.composition.crop}
            options={CROPS}
            onChange={(v) => patch((c) => ({ ...c, composition: { ...c.composition, crop: v } }))}
          />
          <OptionSelect
            id="separation"
            label="Background separation"
            value={settings.composition.backgroundSeparation}
            options={SEPARATION}
            onChange={(v) =>
              patch((c) => ({ ...c, composition: { ...c.composition, backgroundSeparation: v } }))
            }
          />
        </div>

        <label className="mt-4 flex items-center justify-between gap-3 text-[12px]">
          <span className="font-semibold">Mirror the reference pose</span>
          <Switch
            checked={settings.composition.mirrorPose}
            onCheckedChange={(v) =>
              patch((c) => ({ ...c, composition: { ...c.composition, mirrorPose: v } }))
            }
            aria-label="Mirror the reference pose"
          />
        </label>
      </section>

      <Separator />

      {/* ----------------------------------------------------------- finish */}
      <section>
        <PanelTitle>Finish</PanelTitle>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <OptionSelect
            id="retouch"
            label="Retouch"
            value={settings.finish.retouch}
            options={RETOUCH}
            onChange={(v) => patch((c) => ({ ...c, finish: { ...c.finish, retouch: v } }))}
          />
          <OptionSelect
            id="grade"
            label="Colour grade"
            value={settings.finish.colorGrade}
            options={GRADES}
            onChange={(v) => patch((c) => ({ ...c, finish: { ...c.finish, colorGrade: v } }))}
          />
          <OptionSelect
            id="grain"
            label="Grain"
            value={settings.finish.grain}
            options={GRAIN}
            onChange={(v) => patch((c) => ({ ...c, finish: { ...c.finish, grain: v } }))}
          />
        </div>

        <div className="mt-4">
          <FidelitySlider
            id="sharpness"
            label="Sharpness"
            value={settings.finish.sharpness}
            onChange={(v) => patch((c) => ({ ...c, finish: { ...c.finish, sharpness: v } }))}
          />
        </div>

        <div className="mt-4">
          <Field
            label="Negative prompt"
            htmlFor="negative-prompt"
            help="What to avoid. Max 400 characters."
          >
            <Textarea
              id="negative-prompt"
              value={settings.negativePrompt}
              maxLength={400}
              placeholder="extra fingers, warped text, harsh shadows"
              onChange={(event) => patch((c) => ({ ...c, negativePrompt: event.target.value }))}
            />
          </Field>
        </div>
      </section>

      <Separator />

      {/* ----------------------------------------------------------- output */}
      <section>
        <PanelTitle>Output</PanelTitle>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <OptionSelect
            id="aspect"
            label="Aspect ratio"
            value={settings.output.aspectRatio}
            options={ASPECT_RATIOS}
            onChange={(v) => patch((c) => ({ ...c, output: { ...c.output, aspectRatio: v } }))}
          />
          <OptionSelect
            id="quality"
            label="Quality"
            value={settings.output.quality}
            options={QUALITIES}
            onChange={(v) => patch((c) => ({ ...c, output: { ...c.output, quality: v } }))}
            help="Higher quality costs more output tokens."
          />
          <Field
            label="Variants"
            htmlFor="variants"
            labelAside={settings.output.variantCount}
            help={`Up to ${MAX_VARIANTS}. Each variant is a separate billed generation.`}
          >
            <Slider
              id="variants"
              min={1}
              max={MAX_VARIANTS}
              step={1}
              value={[settings.output.variantCount]}
              onValueChange={([next]) =>
                patch((c) => ({ ...c, output: { ...c.output, variantCount: next } }))
              }
              aria-label="Number of variants"
            />
          </Field>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <FidelitySlider
            id="variation-strength"
            label="Variation strength"
            value={settings.output.variationStrength}
            onChange={(v) =>
              patch((c) => ({ ...c, output: { ...c.output, variationStrength: v } }))
            }
            help="How different each variant should be."
          />
          <Field
            label="Seed"
            htmlFor="seed"
            help="Leave blank for a random seed. Reuse a seed to reproduce a result."
          >
            <Input
              id="seed"
              type="number"
              min={0}
              max={2147483647}
              value={settings.output.seed ?? ''}
              placeholder="Random"
              onChange={(event) =>
                patch((c) => ({
                  ...c,
                  output: {
                    ...c.output,
                    seed: event.target.value === '' ? null : Number(event.target.value),
                  },
                }))
              }
            />
          </Field>
        </div>
      </section>

      <Separator />

      {/* ---------------------------------------------------- pose collage */}
      <section>
        <PanelTitle>Pose contact sheet</PanelTitle>
        <label className="flex items-center justify-between gap-3 text-[12px]">
          <span>
            <span className="font-semibold">Split an uploaded sheet into separate poses</span>
            <span className="block text-[10px] text-[var(--pf-text-tertiary)]">
              {poseIsUpload
                ? 'One generation is produced per cell.'
                : 'Upload a pose photo to enable this — library references are already single poses.'}
            </span>
          </span>
          <Switch
            checked={settings.poseCollage.enabled}
            disabled={!poseIsUpload}
            onCheckedChange={(v) =>
              patch((c) => ({ ...c, poseCollage: { ...c.poseCollage, enabled: v } }))
            }
            aria-label="Split pose contact sheet"
          />
        </label>

        {settings.poseCollage.enabled && poseIsUpload ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field
              label="Cells"
              htmlFor="collage-count"
              labelAside={settings.poseCollage.count}
              help="Each cell becomes one generation."
            >
              <Slider
                id="collage-count"
                min={2}
                max={6}
                step={1}
                value={[settings.poseCollage.count]}
                onValueChange={([next]) =>
                  patch((c) => ({ ...c, poseCollage: { ...c.poseCollage, count: next } }))
                }
                aria-label="Contact sheet cells"
              />
            </Field>
            <OptionSelect
              id="collage-layout"
              label="Layout"
              value={settings.poseCollage.layout}
              options={COLLAGE_LAYOUTS}
              onChange={(v) =>
                patch((c) => ({ ...c, poseCollage: { ...c.poseCollage, layout: v } }))
              }
            />
          </div>
        ) : null}
      </section>
    </div>
  );
}
